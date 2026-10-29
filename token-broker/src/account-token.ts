/**
 * Verifies a Rafeeq account token: a Supabase Auth access token, which the
 * app sends as `authorization: Bearer <token>` on the speech routes.
 *
 * Supabase signs access tokens with an asymmetric ES256 key and publishes the
 * public keys at `<project>/auth/v1/.well-known/jwks.json`. Verifying needs
 * nothing but WebCrypto: an ES256 JWT signature is the raw r||s pair, which is
 * exactly what `crypto.subtle.verify` takes for ECDSA.
 *
 * The keys are cached per isolate, so a verification normally costs no network
 * round-trip. Only tokens Supabase signed with one of its current keys pass:
 * any other algorithm (none, HS256, …), a forged or edited token, another
 * project's token, or an expired one is refused.
 */

/** How long a fetched key set is trusted before it is fetched again. */
const JWKS_TTL_MS = 10 * 60 * 1000;

/** A token whose `kid` is not in the cached key set refetches the keys (a
 *  rotation may have published a new one), but at most this often. The token
 *  is unauthenticated input, so without a floor anyone could make the Worker
 *  call Supabase on every request by sending made-up `kid`s. */
const UNKNOWN_KID_REFETCH_MS = 60 * 1000;

interface KeySet {
  url: string; // the JWKS URL these keys came from
  keys: Map<string, CryptoKey>; // kid → ES256 public key
  fetchedAt: number; // ms; when the keys were last fetched (or tried)
}

let keySet: KeySet | null = null;

/**
 * The token's `sub` (the account id) when it is a valid, unexpired Supabase
 * access token for the project at `supabaseUrl`; null for anything else. Never
 * throws.
 */
export async function verifyAccountToken(
  token: string,
  supabaseUrl: string,
  nowMs: number,
): Promise<string | null> {
  try {
    const authUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;

    const header = decodeJsonPart(headerPart);
    // `alg` is pinned, never taken from the token: that is what keeps "none"
    // and HS256-signed-with-the-public-key forgeries out. A `crit` header
    // names extensions this code doesn't implement, so it is refused (RFC
    // 7515 §4.1.11).
    if (!header || header.alg !== "ES256" || header.crit !== undefined) return null;
    if (typeof header.kid !== "string" || header.kid === "") return null;

    const claims = decodeJsonPart(payloadPart);
    if (!claims) return null;
    if (claims.iss !== authUrl || claims.aud !== "authenticated") return null;
    if (typeof claims.exp !== "number" || !(claims.exp * 1000 > nowMs)) return null;
    if (typeof claims.sub !== "string" || claims.sub === "") return null;

    const signature = decodeBase64Url(signaturePart);
    if (signature.length !== 64) return null; // P-256 r||s is always 64 bytes

    const key = await keyFor(header.kid, `${authUrl}/.well-known/jwks.json`, nowMs);
    if (!key) return null;

    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      signed,
    );
    return valid ? claims.sub : null;
  } catch {
    return null;
  }
}

/** The public key for `kid`, from the cached key set, refreshing it when it
 *  is older than JWKS_TTL_MS, belongs to another project, or lacks `kid`. */
async function keyFor(kid: string, jwksUrl: string, nowMs: number): Promise<CryptoKey | null> {
  const age = keySet && keySet.url === jwksUrl ? nowMs - keySet.fetchedAt : Infinity;
  const stale = age >= JWKS_TTL_MS;
  const unknownKid = !keySet?.keys.has(kid) && age >= UNKNOWN_KID_REFETCH_MS;
  if (stale || unknownKid) await refreshKeys(jwksUrl, nowMs);
  return keySet?.keys.get(kid) ?? null;
}

/**
 * Fetches the key set. If Supabase can't be reached or answers with garbage,
 * the keys already held for this project stay in use (they are still
 * Supabase's own keys), so an outage there doesn't sign every subscriber out
 * of recite mode. The attempt still counts as a fetch, so an outage costs one
 * retry per UNKNOWN_KID_REFETCH_MS at most, not one per request.
 */
async function refreshKeys(jwksUrl: string, nowMs: number): Promise<void> {
  const previous = keySet?.url === jwksUrl ? keySet.keys : new Map<string, CryptoKey>();
  let keys = previous;
  try {
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
    const fetched = await importKeys(await res.json());
    if (fetched.size === 0) throw new Error("JWKS has no ES256 keys");
    keys = fetched;
  } catch (err) {
    console.error("Supabase JWKS fetch failed; keeping the previous keys", err);
  }
  keySet = { url: jwksUrl, keys, fetchedAt: nowMs };
}

interface Jwk {
  kty?: unknown;
  crv?: unknown;
  alg?: unknown;
  use?: unknown;
  kid?: unknown;
  x?: unknown;
  y?: unknown;
}

/** Imports every ES256 signing key in a JWKS body; anything else is skipped. */
async function importKeys(body: unknown): Promise<Map<string, CryptoKey>> {
  const keys = new Map<string, CryptoKey>();
  const list = (body as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(list)) return keys;
  for (const jwk of list as Jwk[]) {
    if (jwk?.kty !== "EC" || jwk.crv !== "P-256") continue;
    if (jwk.alg !== undefined && jwk.alg !== "ES256") continue;
    if (jwk.use !== undefined && jwk.use !== "sig") continue;
    if (typeof jwk.kid !== "string" || typeof jwk.x !== "string" || typeof jwk.y !== "string") {
      continue;
    }
    try {
      // Only the public point is passed on, so key_ops/ext in the published
      // JWK can't conflict with the "verify" usage asked for here.
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    } catch {
      // A key that won't import can't verify anything; the others still can.
    }
  }
  return keys;
}

/** The JSON object in a base64url JWT segment, or null if it isn't one. */
function decodeJsonPart(part: string): Record<string, unknown> | null {
  const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Decodes unpadded base64url; throws on any other character. */
function decodeBase64Url(part: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("not base64url");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
