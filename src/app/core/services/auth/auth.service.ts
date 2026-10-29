import { SocialLogin } from "@capgo/capacitor-social-login";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.client";

export type AuthProviderId = "google" | "apple";

export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  provider: AuthProviderId;
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
    new TextEncoder().encode(raw),
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
  return toAccountUser(data.user);
}

/** Null means the person cancelled; real failures throw. */
export async function signIn(
  provider: AuthProviderId,
): Promise<AccountUser | null> {
  if (provider === "google") return signInWithGoogle();
  throw new Error("apple sign-in not available");
}

export async function signOut(): Promise<void> {
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

async function storedSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function currentUser(): Promise<AccountUser | null> {
  const session = await storedSession();
  return session?.user ? toAccountUser(session.user) : null;
}

export function onAccountChange(
  cb: (user: AccountUser | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ? toAccountUser(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
}

/** Supabase refreshes the token when it is near expiry. */
export async function accessToken(): Promise<string | null> {
  return (await storedSession())?.access_token ?? null;
}
