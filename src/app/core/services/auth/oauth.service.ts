import { Capacitor } from "@capacitor/core";

const CLIENT_ID = process.env.REACT_APP_QF_OAUTH_CLIENT_ID || "";
const REDIRECT_URI_WEB =
  process.env.REACT_APP_QF_OAUTH_REDIRECT_URI_WEB ||
  "http://localhost:8100/auth/callback";
const REDIRECT_URI_NATIVE =
  process.env.REACT_APP_QF_OAUTH_REDIRECT_URI_NATIVE ||
  "com.rafeeq.quranquiz://auth/callback";
const AUTH_BASE = "https://oauth2.quran.foundation/oauth2";

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL || "";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint32Array(56 / 2);
  crypto.getRandomValues(array);
  return Array.from(array, (dec) => ("0" + dec.toString(16)).slice(-2)).join(
    "",
  );
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = "rafiq_oauth_token_v1";
const REFRESH_KEY = "rafiq_oauth_refresh_v1";
const ID_TOKEN_KEY = "rafiq_oauth_idtoken_v1";
const CODE_VERIFIER_KEY = "oauth_code_verifier"; // ✅ localStorage (cross-tab)

async function storeTokens(
  accessToken: string,
  refreshToken?: string,
  idToken?: string,
): Promise<void> {
  if (Capacitor.getPlatform() === "web") {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    if (idToken) localStorage.setItem(ID_TOKEN_KEY, idToken);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: TOKEN_KEY, value: accessToken });
    if (refreshToken)
      await Preferences.set({ key: REFRESH_KEY, value: refreshToken });
    if (idToken) await Preferences.set({ key: ID_TOKEN_KEY, value: idToken });
  }
}

export async function getStoredAccessToken(): Promise<string | null> {
  if (Capacitor.getPlatform() === "web") {
    return localStorage.getItem(TOKEN_KEY);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value || null;
  }
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (Capacitor.getPlatform() === "web") {
    return localStorage.getItem(REFRESH_KEY);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: REFRESH_KEY });
    return value || null;
  }
}

export async function getStoredIdToken(): Promise<string | null> {
  if (Capacitor.getPlatform() === "web") {
    return localStorage.getItem(ID_TOKEN_KEY);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: ID_TOKEN_KEY });
    return value || null;
  }
}

export async function clearTokens(): Promise<void> {
  if (Capacitor.getPlatform() === "web") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ID_TOKEN_KEY);
    localStorage.removeItem(CODE_VERIFIER_KEY);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: TOKEN_KEY });
    await Preferences.remove({ key: REFRESH_KEY });
    await Preferences.remove({ key: ID_TOKEN_KEY });
  }
}

// ── User profile from ID token (no CORS) ──────────────────────────────────────

export interface OAuthUserProfile {
  sub: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export function getUserProfileFromIdToken(): OAuthUserProfile | null {
  try {
    const raw = localStorage.getItem(ID_TOKEN_KEY);
    if (!raw) return null;
    // Decode JWT payload (middle part)
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return {
      sub: payload.sub ?? "",
      firstName: payload.first_name,
      lastName: payload.last_name,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function signIn(): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // ✅ Store in localStorage so it's available across tabs
  localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

  const redirectUri =
    Capacitor.getPlatform() === "web" ? REDIRECT_URI_WEB : REDIRECT_URI_NATIVE;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "openid profile offline_access streak streak.read",
    state: crypto.randomUUID(),
  });

  const authUrl = `${AUTH_BASE}/auth?${params.toString()}`;
  window.open(authUrl, "_blank");
  return authUrl;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string }> {
  // ✅ Read from localStorage (cross-tab safe)
  const codeVerifier = localStorage.getItem(CODE_VERIFIER_KEY) || "";
  const redirectUri =
    Capacitor.getPlatform() === "web" ? REDIRECT_URI_WEB : REDIRECT_URI_NATIVE;

  const res = await fetch(`${TOKEN_BROKER_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[oauth] token exchange failed:", res.status, body);
    throw new Error(`Token exchange failed: ${res.status} — ${body}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const idToken = data.id_token;

  await storeTokens(accessToken, refreshToken, idToken);
  localStorage.removeItem(CODE_VERIFIER_KEY); // clean up
  return { accessToken, refreshToken, idToken };
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error("No refresh token available");

  const res = await fetch(`${TOKEN_BROKER_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    await clearTokens();
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  await storeTokens(data.access_token, data.refresh_token, data.id_token);
  return data.access_token;
}

export async function signOut(): Promise<void> {
  await clearTokens();
}
