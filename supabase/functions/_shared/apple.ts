/**
 * SIGN IN WITH APPLE — server-side token calls
 *
 * Apple authenticates the app's server by a short-lived ES256 JWT (the
 * "client secret") signed with the .p8 key from the developer account.
 * `exchangeAppleCode` turns a sign-in's authorization code into the
 * refresh token kept in `apple_tokens`; `revokeAppleToken` revokes it when
 * the account is deleted, as Apple requires.
 *
 * Every call names the client id it acts for: Apple only accepts a revoke
 * from the client id the token was issued to (the bundle id for the native
 * iOS sign-in, the Services ID for the web flow), and the secret's `sub`
 * must match it. That is why a stored token carries its client id.
 *
 * Web-standard APIs only (fetch, crypto.subtle, atob/btoa), so this runs in
 * the Deno edge runtime and in the Node tests alike.
 */

export interface AppleKey {
  teamId: string;
  keyId: string;
  /** The .p8 key, PKCS#8 PEM. Escaped "\n" sequences are accepted. */
  privateKeyPem: string;
}

/** A refresh token and the client id it was issued to. */
export interface AppleGrant {
  refreshToken: string;
  clientId: string;
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
export async function appleClientSecret(key: AppleKey, clientId: string, nowSec: number): Promise<string> {
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(key.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signingInput = `${b64urlJson({ alg: "ES256", kid: key.keyId })}.${b64urlJson({
    iss: key.teamId,
    iat: nowSec,
    exp: nowSec + SECRET_LIFETIME_SEC,
    aud: APPLE,
    sub: clientId,
  })}`;
  // WebCrypto's ECDSA signature is already the raw r||s that JWS expects.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
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

/** Exchanges a sign-in's authorization code, issued to `clientId`, for its refresh token. */
export async function exchangeAppleCode(code: string, clientId: string, key: AppleKey): Promise<AppleGrant> {
  const res = await postForm("/auth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: await appleClientSecret(key, clientId, nowSec()),
    code,
  });
  const { refresh_token } = (await res.json()) as { refresh_token?: string };
  if (!refresh_token) throw new Error("apple /auth/token returned no refresh token");
  return { refreshToken: refresh_token, clientId };
}

export async function revokeAppleToken(grant: AppleGrant, key: AppleKey): Promise<void> {
  await postForm("/auth/revoke", {
    client_id: grant.clientId,
    client_secret: await appleClientSecret(key, grant.clientId, nowSec()),
    token: grant.refreshToken,
    token_type_hint: "refresh_token",
  });
}
