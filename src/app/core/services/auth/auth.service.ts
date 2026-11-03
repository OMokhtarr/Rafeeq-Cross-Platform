import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.client";

/**
 * AUTH SERVICE
 *
 * Supabase's getSession() returns no session when the stored access token
 * is expired and the refresh fails (e.g. offline at launch). That must not
 * read as "signed out", so the last known AccountUser is cached in
 * localStorage: it is used only when getSession() reports an error, and is
 * cleared on sign-out or a session that is genuinely gone.
 */
export type AuthProviderId = "google" | "apple";

export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  provider: AuthProviderId;
}

const ACCOUNT_CACHE_KEY = "rafiq_account_v1";

function readCache(): AccountUser | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

/** Someone was signed in on this phone when the app last knew. */
export function hasCachedAccount(): boolean {
  return readCache() !== null;
}

function writeCache(user: AccountUser | null): void {
  try {
    if (user) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    // storage unavailable: the cache is only a convenience
  }
}

let socialLoginReady: Promise<void> | null = null;

const isIos = () => Capacitor.getPlatform() === "ios";

function initSocialLogin(): Promise<void> {
  if (!socialLoginReady) {
    socialLoginReady = SocialLogin.initialize({
      google: {
        webClientId: process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID,
        mode: "online",
      },
      // Native Sign in with Apple exists only on iOS. "Proper token
      // exchange" makes the plugin hand back Apple's authorization code
      // (otherwise it is folded into accessToken).
      ...(isIos() ? { apple: { useProperTokenExchange: true } } : {}),
    }).catch((e) => {
      socialLoginReady = null;
      throw e;
    });
  }
  return socialLoginReady;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Raw nonce goes to Supabase; its SHA-256 goes to Google/Apple (via the plugin). */
async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  return { raw, hashed: toHex(new Uint8Array(digest)) };
}

function isUserCancel(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "USER_CANCELLED";
}

function toAccountUser(user: User): AccountUser {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
    provider: user.app_metadata?.provider === "apple" ? "apple" : "google",
  };
}

async function signInWithGoogle(): Promise<AccountUser | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("auth not configured");
  await initSocialLogin();
  const { raw, hashed } = await createNonce();

  let idToken: string | null | undefined;
  try {
    const login = await SocialLogin.login({
      provider: "google",
      options: { nonce: hashed },
    });
    idToken = (login.result as { idToken?: string | null }).idToken;
  } catch (e) {
    if (isUserCancel(e)) return null;
    throw e;
  }
  if (!idToken) throw new Error("google sign-in returned no id token");

  const { account } = await sessionFromIdToken("google", idToken, raw);
  return account;
}

function rememberAccount(user: User | null | undefined): AccountUser {
  if (!user) throw new Error("sign-in returned no user");
  const account = toAccountUser(user);
  writeCache(account);
  return account;
}

async function sessionFromIdToken(
  provider: AuthProviderId,
  token: string,
  nonce: string
): Promise<{ account: AccountUser; accessToken: string | null }> {
  const { data, error } = await getSupabase()!.auth.signInWithIdToken({
    provider,
    token,
    nonce,
  });
  if (error) throw error;
  return {
    account: rememberAccount(data.user),
    accessToken: data.session?.access_token ?? null,
  };
}

/**
 * Hands Apple's authorization code to the apple-token function, which keeps
 * the refresh token so that deleting the account can revoke it. Never
 * throws: a failure leaves the sign-in intact, and the later deletion simply
 * finds no token to revoke.
 */
async function sendAppleCode(
  code: string,
  accessToken: string | null
): Promise<void> {
  try {
    if (!accessToken) throw new Error("no access token");
    const res = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/apple-token`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ authorizationCode: code }),
      }
    );
    if (!res.ok) throw new Error(`apple-token failed: ${res.status}`);
  } catch (e) {
    console.warn("[auth] storing the Apple token failed", e);
  }
}

/** iOS: the system Sign in with Apple sheet, then Supabase's id-token sign-in. */
async function signInWithAppleNative(): Promise<AccountUser | null> {
  if (!getSupabase()) throw new Error("auth not configured");
  await initSocialLogin();
  const { raw, hashed } = await createNonce();

  let result: { idToken?: string | null; authorizationCode?: string };
  try {
    const login = await SocialLogin.login({
      provider: "apple",
      options: { scopes: ["email", "name"], nonce: hashed },
    });
    result = login.result;
  } catch (e) {
    if (isUserCancel(e)) return null;
    throw e;
  }
  if (!result.idToken) throw new Error("apple sign-in returned no id token");

  const { account, accessToken } = await sessionFromIdToken(
    "apple",
    result.idToken,
    raw
  );
  if (result.authorizationCode) {
    void sendAppleCode(result.authorizationCode, accessToken);
  } else {
    console.warn("[auth] apple sign-in returned no authorization code");
  }
  return account;
}

/**
 * ANDROID APPLE SIGN-IN — Supabase's OAuth web flow
 *
 * Android has no native Sign in with Apple, so the sign-in runs on Apple's
 * web page in a browser tab and returns through the rafeeq://auth/callback
 * deep link (App.tsx → completeOAuthRedirect), whose PKCE code becomes the
 * session. This flow never gives the app Apple's authorization code, so no
 * Apple token is stored for these accounts and deleting one skips the
 * revoke.
 *
 * A closed tab with no callback is a cancel. The deep link and the tab's
 * "finished" event arrive close together in either order, so a closed tab
 * only counts once CALLBACK_GRACE_MS pass without a callback.
 */
const AUTH_CALLBACK_URL = "rafeeq://auth/callback";
const CALLBACK_GRACE_MS = 1500;
const CANCEL_ERRORS = new Set(["user_cancelled_authorize", "access_denied"]);

type SignInResult = { user: AccountUser | null } | { error: unknown };

interface PendingOAuth {
  /** The callback has arrived, so a closed tab no longer means cancelled. */
  claim(): void;
  /** Settles the waiting signIn("apple"); later calls are ignored. */
  settle(result: SignInResult): void;
}

let pendingOAuth: PendingOAuth | null = null;

async function signInWithAppleWeb(): Promise<AccountUser | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("auth not configured");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: AUTH_CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("apple sign-in returned no url");
  const url = data.url;

  // An earlier sign-in still waiting gives way to this one.
  pendingOAuth?.settle({ user: null });

  return new Promise((resolve, reject) => {
    let claimed = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let removeListener = () => {};

    const pending: PendingOAuth = {
      claim() {
        claimed = true;
        clearTimeout(graceTimer);
      },
      settle(result) {
        if (pendingOAuth !== pending) return;
        pendingOAuth = null;
        clearTimeout(graceTimer);
        removeListener();
        if ("error" in result) reject(result.error);
        else resolve(result.user);
      },
    };
    pendingOAuth = pending;

    Browser.addListener("browserFinished", () => {
      if (claimed) return;
      graceTimer = setTimeout(
        () => pending.settle({ user: null }),
        CALLBACK_GRACE_MS
      );
    })
      .then((handle) => {
        removeListener = () => void handle.remove();
        if (pendingOAuth !== pending) return removeListener();
        return Browser.open({ url });
      })
      .catch((e) => pending.settle({ error: e }));
  });
}

/** Query and fragment parameters together; Supabase may use either. */
function callbackParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

async function accountFromCallback(url: string): Promise<AccountUser | null> {
  const params = callbackParams(url);
  const code = params.get("code");
  if (!code) {
    const error = params.get("error");
    // The person declining is a cancel, like closing the tab: Apple's own
    // Cancel arrives as "user_cancelled_authorize" (Supabase forwards the
    // provider's error), OAuth's generic refusal as "access_denied". Any
    // other error is a real failure.
    if (error && CANCEL_ERRORS.has(error)) return null;
    throw new Error(
      params.get("error_description") ?? error ?? "callback carried no code"
    );
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("auth not configured");
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return rememberAccount(data.user);
}

/**
 * Finishes the Android Apple web flow from its rafeeq://auth/callback deep
 * link, settling the waiting signIn("apple"). With none waiting (the app
 * was killed while the tab was open) the session is still created, and
 * onAccountChange reports it. Never rejects: a failure goes to the waiting
 * sign-in, or is logged.
 */
export async function completeOAuthRedirect(url: string): Promise<void> {
  const pending = pendingOAuth;
  pending?.claim();
  let result: SignInResult;
  try {
    result = { user: await accountFromCallback(url) };
  } catch (error) {
    result = { error };
  }
  await Browser.close().catch(() => {});
  if (pending) pending.settle(result);
  else if ("error" in result) {
    console.warn("[auth] oauth callback failed", result.error);
  }
}

/** Null means the person cancelled; real failures throw. */
export async function signIn(
  provider: AuthProviderId
): Promise<AccountUser | null> {
  if (provider === "google") return signInWithGoogle();
  return isIos() ? signInWithAppleNative() : signInWithAppleWeb();
}

export async function signOut(): Promise<void> {
  const provider = readCache()?.provider;
  writeCache(null);
  try {
    await getSupabase()?.auth.signOut({ scope: "local" });
  } catch (e) {
    console.warn("[auth] supabase signOut failed", e);
  }
  // Apple on Android signed in through the browser, not the plugin, so
  // there is nothing to log out of there.
  const plugin = provider === "apple" ? (isIos() ? "apple" : null) : "google";
  if (!plugin) return;
  try {
    await SocialLogin.logout({ provider: plugin });
  } catch (e) {
    console.warn("[auth] social logout failed", e);
  }
}

export async function currentUser(): Promise<AccountUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (data.session?.user) {
    const account = toAccountUser(data.session.user);
    writeCache(account);
    return account;
  }
  // A failed refresh is not a sign-out: keep the person signed in offline.
  if (error) return readCache();
  writeCache(null);
  return null;
}

export function onAccountChange(
  cb: (user: AccountUser | null) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const account = toAccountUser(session.user);
      writeCache(account);
      cb(account);
    } else if (event === "SIGNED_OUT") {
      writeCache(null);
      cb(null);
    }
  });
  return () => data.subscription.unsubscribe();
}

/** Supabase refreshes the token when it is near expiry. */
export async function accessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Deletes the signed-in account on the server (the delete-account edge
 * function: Apple revoke, RevenueCat customer, then the auth user), then
 * signs out locally. Any failure throws before the sign-out, so the person
 * stays signed in and can try again. A 401 means the function no longer
 * knows this token's account: a retry after a lost response finds it already
 * deleted, so that signs out too.
 */
export async function deleteAccount(): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error("not signed in");
  const res = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/delete-account`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
    }
  );
  if (!res.ok && res.status !== 401) throw new Error(`delete-account failed: ${res.status}`);
  await signOut();
}
