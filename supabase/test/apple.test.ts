/**
 * Sign in with Apple helpers: the ES256 client secret is checked against a
 * locally generated P-256 key, the token endpoints against a stubbed fetch.
 */

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  appleClientSecret,
  appleKeyFromEnv,
  exchangeAppleCode,
  revokeAppleToken,
} from "../functions/_shared/apple.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;

const KEY = { teamId: "TEAM123456", keyId: "KEY1234567", privateKeyPem: pem };
const CLIENT_ID = "com.rafeeq.quranquiz";
const NOW = 1_800_000_000;

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

test("appleClientSecret is an ES256 JWT with Apple's header and claims", async () => {
  const [header, payload] = (await appleClientSecret(KEY, CLIENT_ID, NOW)).split(".");
  assert.deepEqual(decode(header), { alg: "ES256", kid: KEY.keyId });
  assert.deepEqual(decode(payload), {
    iss: KEY.teamId,
    iat: NOW,
    exp: NOW + 300,
    aud: "https://appleid.apple.com",
    sub: CLIENT_ID,
  });
});

test("appleClientSecret's signature verifies with the key's public half", async () => {
  const [header, payload, signature] = (await appleClientSecret(KEY, CLIENT_ID, NOW)).split(".");
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
  const jwt = await appleClientSecret({ ...KEY, privateKeyPem: pem.replace(/\n/g, "\\n") }, CLIENT_ID, NOW);
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

test("exchangeAppleCode posts the code and returns the refresh token with its client id", async () => {
  const seen = stubFetch(200, { refresh_token: "r-1", access_token: "a-1" });
  assert.deepEqual(await exchangeAppleCode("code-1", CLIENT_ID, KEY), { refreshToken: "r-1", clientId: CLIENT_ID });
  assert.equal(seen[0].url, "https://appleid.apple.com/auth/token");
  assert.equal(seen[0].form.get("grant_type"), "authorization_code");
  assert.equal(seen[0].form.get("code"), "code-1");
  assert.equal(seen[0].form.get("client_id"), CLIENT_ID);
  assert.equal(decode(seen[0].form.get("client_secret")!.split(".")[1]).sub, CLIENT_ID);
});

test("exchangeAppleCode throws on a non-2xx response", async () => {
  stubFetch(400, { error: "invalid_grant" });
  await assert.rejects(exchangeAppleCode("bad", CLIENT_ID, KEY), /400/);
});

test("revokeAppleToken posts the refresh token under the client id that issued it", async () => {
  const seen = stubFetch(200, {});
  await revokeAppleToken({ refreshToken: "r-1", clientId: "com.rafeeq.quranquiz.signin" }, KEY);
  assert.equal(seen[0].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(seen[0].form.get("token"), "r-1");
  assert.equal(seen[0].form.get("token_type_hint"), "refresh_token");
  assert.equal(seen[0].form.get("client_id"), "com.rafeeq.quranquiz.signin");
  assert.equal(decode(seen[0].form.get("client_secret")!.split(".")[1]).sub, "com.rafeeq.quranquiz.signin");
});

test("revokeAppleToken throws on a non-2xx response", async () => {
  stubFetch(400, { error: "invalid_client" });
  await assert.rejects(revokeAppleToken({ refreshToken: "r-1", clientId: CLIENT_ID }, KEY), /400/);
});

test("appleKeyFromEnv reads the three key secrets and is null while any is missing", () => {
  const vars: Record<string, string> = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P" };
  assert.deepEqual(appleKeyFromEnv((n) => vars[n]), { teamId: "T", keyId: "K", privateKeyPem: "P" });
  assert.equal(appleKeyFromEnv((n) => (n === "APPLE_KEY_ID" ? null : vars[n])), null);
});
