/**
 * Sign in with Apple helpers: the ES256 client secret is checked against a
 * locally generated P-256 key, the token endpoints against a stubbed fetch.
 */

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { appleClientSecret, exchangeAppleCode, revokeAppleToken } from "../functions/_shared/apple.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;

const CFG = { teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.rafeeq.quranquiz.signin", privateKeyPem: pem };
const NOW = 1_800_000_000;

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

test("appleClientSecret is an ES256 JWT with Apple's header and claims", async () => {
  const [header, payload] = (await appleClientSecret(CFG, NOW)).split(".");
  assert.deepEqual(decode(header), { alg: "ES256", kid: CFG.keyId });
  assert.deepEqual(decode(payload), {
    iss: CFG.teamId,
    iat: NOW,
    exp: NOW + 300,
    aud: "https://appleid.apple.com",
    sub: CFG.clientId,
  });
});

test("appleClientSecret's signature verifies with the key's public half", async () => {
  const [header, payload, signature] = (await appleClientSecret(CFG, NOW)).split(".");
  const sig = Buffer.from(signature, "base64url");
  assert.equal(sig.length, 64, "raw r||s, not DER");
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pair.publicKey,
    sig,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  assert.equal(ok, true);
});

test("appleClientSecret accepts a key whose newlines arrive escaped", async () => {
  const jwt = await appleClientSecret({ ...CFG, privateKeyPem: pem.replace(/\n/g, "\\n") }, NOW);
  assert.equal(jwt.split(".").length, 3);
});

function stubFetch(status: number, body: unknown) {
  const seen: { url: string; form: URLSearchParams }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, form: new URLSearchParams(init.body as string) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return seen;
}

test("exchangeAppleCode posts the code and returns the refresh token", async () => {
  const seen = stubFetch(200, { refresh_token: "r-1", access_token: "a-1" });
  assert.equal(await exchangeAppleCode("code-1", CFG), "r-1");
  assert.equal(seen[0].url, "https://appleid.apple.com/auth/token");
  assert.equal(seen[0].form.get("grant_type"), "authorization_code");
  assert.equal(seen[0].form.get("code"), "code-1");
  assert.equal(seen[0].form.get("client_id"), CFG.clientId);
  assert.equal(seen[0].form.get("client_secret")!.split(".").length, 3);
});

test("exchangeAppleCode throws on a non-2xx response", async () => {
  stubFetch(400, { error: "invalid_grant" });
  await assert.rejects(exchangeAppleCode("bad", CFG), /400/);
});

test("revokeAppleToken posts the refresh token with its type hint", async () => {
  const seen = stubFetch(200, {});
  await revokeAppleToken("r-1", CFG);
  assert.equal(seen[0].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(seen[0].form.get("token"), "r-1");
  assert.equal(seen[0].form.get("token_type_hint"), "refresh_token");
  assert.equal(seen[0].form.get("client_id"), CFG.clientId);
});

test("revokeAppleToken throws on a non-2xx response", async () => {
  stubFetch(400, { error: "invalid_client" });
  await assert.rejects(revokeAppleToken("r-1", CFG), /400/);
});
