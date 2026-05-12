import { Capacitor } from "@capacitor/core";

const CLIENT_ID = process.env.REACT_APP_QF_OAUTH_CLIENT_ID || "";
const REDIRECT_URI_WEB =
  process.env.REACT_APP_QF_OAUTH_REDIRECT_URI_WEB ||
  "http://localhost:8100/auth/callback";
const REDIRECT_URI_NATIVE =
  process.env.REACT_APP_QF_OAUTH_REDIRECT_URI_NATIVE ||
  "com.rafeeq.quranquiz://auth/callback";
const AUTH_BASE = "https://oauth2.quran.foundation/oauth2";

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

async function storeTokens(
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  if (Capacitor.getPlatform() === "web") {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: TOKEN_KEY, value: accessToken });
    if (refreshToken)
      await Preferences.set({ key: REFRESH_KEY, value: refreshToken });
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

export async function clearTokens(): Promise<void> {
  if (Capacitor.getPlatform() === "web") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } else {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: TOKEN_KEY });
    await Preferences.remove({ key: REFRESH_KEY });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the OAuth2 login flow. Opens the system browser / external app.
 */
export async function signIn(): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem("oauth_code_verifier", codeVerifier);

  const redirectUri =
    Capacitor.getPlatform() === "web" ? REDIRECT_URI_WEB : REDIRECT_URI_NATIVE;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "openid profile offline_access",
    state: crypto.randomUUID(),
  });

  const authUrl = `${AUTH_BASE}/authorize?${params.toString()}`;

  // Use window.open to launch the system browser on native (Android/iOS) as well.
  // The custom URL scheme (com.rafeeq.quranquiz://…) will return the user to the app.
  window.open(authUrl, "_blank");
  return authUrl;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const codeVerifier = sessionStorage.getItem("oauth_code_verifier") || "";
  const redirectUri =
    Capacitor.getPlatform() === "web" ? REDIRECT_URI_WEB : REDIRECT_URI_NATIVE;

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;

  await storeTokens(accessToken, refreshToken);
  sessionStorage.removeItem("oauth_code_verifier");
  return { accessToken, refreshToken };
}

/**
 * Use a refresh token to obtain a new access token.
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error("No refresh token available");

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
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
  await storeTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

/**
 * Sign out (remove stored tokens).
 */
export async function signOut(): Promise<void> {
  await clearTokens();
}
