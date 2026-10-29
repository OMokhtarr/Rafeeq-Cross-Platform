/**
 * SIGN IN WITH APPLE — server-side token calls
 *
 * Apple authenticates the app's server by a short-lived ES256 JWT (the
 * "client secret") signed with the .p8 key from the developer account.
 * `exchangeAppleCode` turns a sign-in's authorization code into the
 * refresh token kept in `apple_tokens`; `revokeAppleToken` revokes it when
 * the account is deleted, as Apple requires.
 *
 * Web-standard APIs only (fetch, crypto.subtle, atob/btoa), so this runs in
 * the Deno edge runtime and in the Node tests alike.
 */

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** The Services ID (web) or bundle id (native) the token was issued to. */
  clientId: string;
  /** The .p8 key, PKCS#8 PEM. Escaped "\n" sequences are accepted. */
  privateKeyPem: string;
}

const APPLE = "https://appleid.apple.com";
const SECRET_LIFETIME_SEC = 300;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const b64urlJson = (value: object) => b64url(new TextEncoder().encode(JSON.stringify(value)));

function pemToDer(pem: string): ArrayBuffer {
  const bin = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\\n|\s/g, ""));
  const der = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(der);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return der;
}

/** The client secret for Apple's token endpoints, valid for five minutes. */
export async function appleClientSecret(cfg: AppleConfig, nowSec: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(cfg.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signingInput = `${b64urlJson({ alg: "ES256", kid: cfg.keyId })}.${b64urlJson({
    iss: cfg.teamId,
    iat: nowSec,
    exp: nowSec + SECRET_LIFETIME_SEC,
    aud: APPLE,
    sub: cfg.clientId,
  })}`;
  // WebCrypto's ECDSA signature is already the raw r||s that JWS expects.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

async function postForm(path: string, fields: Record<string, string>): Promise<Response> {
  const res = await fetch(`${APPLE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) throw new Error(`apple ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Exchanges a sign-in's authorization code for its refresh token. */
export async function exchangeAppleCode(code: string, cfg: AppleConfig): Promise<string> {
  const res = await postForm("/auth/token", {
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: await appleClientSecret(cfg, nowSec()),
    code,
  });
  const { refresh_token } = (await res.json()) as { refresh_token?: string };
  if (!refresh_token) throw new Error("apple /auth/token returned no refresh token");
  return refresh_token;
}

export async function revokeAppleToken(refreshToken: string, cfg: AppleConfig): Promise<void> {
  await postForm("/auth/revoke", {
    client_id: cfg.clientId,
    client_secret: await appleClientSecret(cfg, nowSec()),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
}
