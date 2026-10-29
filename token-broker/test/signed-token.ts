/**
 * Test helpers: a Supabase-style ES256 signing key, its published JWKS, and
 * access tokens signed with it. Shared by account-token.test.ts and
 * pro-check.test.ts.
 */

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}

export async function newSigningKey(kid: string): Promise<SigningKey> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  return { kid, privateKey: pair.privateKey, publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey) };
}

/** The key set as Supabase publishes it at /auth/v1/.well-known/jwks.json. */
export const jwks = (...keys: SigningKey[]) => ({
  keys: keys.map((k) => ({ ...k.publicJwk, alg: "ES256", use: "sig", kid: k.kid, key_ops: ["verify"], ext: true })),
});

/** The claims of a Supabase access token for `sub`, valid for an hour. */
export const accountClaims = (supabaseUrl: string, sub: string, nowMs = Date.now()) => ({
  iss: `${supabaseUrl}/auth/v1`,
  aud: "authenticated",
  sub,
  role: "authenticated",
  iat: Math.floor(nowMs / 1000),
  exp: Math.floor(nowMs / 1000) + 3600,
});

export const b64url = (data: string | Uint8Array) => Buffer.from(data).toString("base64url");

/** A compact JWT signed with `key`; `header` overrides the ES256 header. */
export async function signToken(
  key: SigningKey,
  claims: object,
  header: object = {},
): Promise<string> {
  const signingInput = `${b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: key.kid, ...header }))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}
