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

function writeCache(user: AccountUser | null): void {
  try {
    if (user) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    // storage unavailable: the cache is only a convenience
  }
}

let socialLoginReady: Promise<void> | null = null;

function initSocialLogin(): Promise<void> {
  if (!socialLoginReady) {
    socialLoginReady = SocialLogin.initialize({
      google: {
        webClientId: process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID,
        mode: "online",
      },
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

/** Raw nonce goes to Supabase; its SHA-256 goes to Google (via the plugin). */
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

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: raw,
  });
  if (error) throw error;
  if (!data.user) throw new Error("sign-in returned no user");
  const account = toAccountUser(data.user);
  writeCache(account);
  return account;
}

/** Null means the person cancelled; real failures throw. */
export async function signIn(
  provider: AuthProviderId
): Promise<AccountUser | null> {
  if (provider === "google") return signInWithGoogle();
  throw new Error("apple sign-in not available");
}

export async function signOut(): Promise<void> {
  writeCache(null);
  try {
    await getSupabase()?.auth.signOut({ scope: "local" });
  } catch (e) {
    console.warn("[auth] supabase signOut failed", e);
  }
  try {
    await SocialLogin.logout({ provider: "google" });
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
 * stays signed in and can try again.
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
  if (!res.ok) throw new Error(`delete-account failed: ${res.status}`);
  await signOut();
}
