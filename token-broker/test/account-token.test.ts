/**
 * verifyAccountToken against a stubbed Supabase JWKS endpoint, with tokens
 * signed by a locally generated P-256 key. Run with `npm test` in
 * token-broker/.
 *
 * The key set is cached in module memory and shared by every case here, so
 * each case uses its own project URL: a new URL never matches the cache.
 */

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { verifyAccountToken } from "../src/account-token.ts";
import { accountClaims, b64url, jwks, newSigningKey, signToken } from "./signed-token.ts";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

const T0 = Date.now();
const MINUTE = 60 * 1000;
const key = await newSigningKey("key-1");

let projects = 0;
const newProject = () => `https://p${++projects}.supabase.test`;
const jwksUrl = (project: string) => `${project}/auth/v1/.well-known/jwks.json`;

/** Stubs fetch with `reply`, recording each URL fetched. */
function supabase(reply: () => Response | Promise<Response>): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return reply();
  }) as typeof fetch;
  return calls;
}

const serving = (body: object) => () => new Response(JSON.stringify(body), { status: 200 });

/** Silences console.error for the current case, returning what was logged. */
function quietErrors(): unknown[][] {
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  return logged;
}

test("returns the sub of a valid Supabase access token", async () => {
  const project = newProject();
  const calls = supabase(serving(jwks(key)));
  const token = await signToken(key, accountClaims(project, "user-123", T0));
  assert.equal(await verifyAccountToken(token, project, T0), "user-123");
  assert.deepEqual(calls, [jwksUrl(project)]);
});

test("accepts a project URL written with a trailing slash", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const token = await signToken(key, accountClaims(project, "user-slash", T0));
  assert.equal(await verifyAccountToken(token, `${project}/`, T0), "user-slash");
});

test("refuses an expired token, including one expiring this very second", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const nowSec = Math.floor(T0 / 1000);
  for (const exp of [nowSec - 1, nowSec]) {
    const token = await signToken(key, { ...accountClaims(project, "user-old", T0), exp });
    assert.equal(await verifyAccountToken(token, project, nowSec * 1000), null, String(exp));
  }
});

test("refuses another project's token (wrong iss)", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const token = await signToken(key, {
    ...accountClaims(project, "user-iss", T0),
    iss: "https://other.supabase.co/auth/v1",
  });
  assert.equal(await verifyAccountToken(token, project, T0), null);
});

test("refuses a token for another audience (wrong aud)", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  for (const aud of ["anon", ["authenticated"]]) {
    const token = await signToken(key, { ...accountClaims(project, "user-aud", T0), aud });
    assert.equal(await verifyAccountToken(token, project, T0), null, JSON.stringify(aud));
  }
});

test("refuses alg none and HS256, whatever signature comes with them", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const payload = b64url(JSON.stringify(accountClaims(project, "user-alg", T0)));
  const realSignature = (await signToken(key, accountClaims(project, "user-alg", T0))).split(".")[2];
  const none = b64url(JSON.stringify({ alg: "none", typ: "JWT", kid: key.kid }));
  const hs256 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: key.kid }));

  // The classic confusion attack: HMAC keyed with the published public key.
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JSON.stringify(jwks(key).keys[0])),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`${hs256}.${payload}`)),
  );

  for (const token of [
    `${none}.${payload}.`,
    `${none}.${payload}.${realSignature}`,
    `${hs256}.${payload}.${b64url(hmac)}`,
    // A real ES256 signature under a header that claims another alg.
    await signToken(key, accountClaims(project, "user-alg", T0), { alg: "HS256" }),
  ]) {
    assert.equal(await verifyAccountToken(token, project, T0), null, token);
  }
});

test("refuses a token whose payload was edited after signing", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const [header, , signature] = (await signToken(key, accountClaims(project, "user-a", T0))).split(".");
  const forged = b64url(JSON.stringify(accountClaims(project, "user-b", T0)));
  assert.equal(await verifyAccountToken(`${header}.${forged}.${signature}`, project, T0), null);
});

test("refuses a token signed by a key Supabase doesn't publish, even under a known kid", async () => {
  const project = newProject();
  supabase(serving(jwks(key)));
  const impostor = await newSigningKey(key.kid);
  const token = await signToken(impostor, accountClaims(project, "user-impostor", T0));
  assert.equal(await verifyAccountToken(token, project, T0), null);
});

test("an unknown kid refetches the keys once, then refuses", async () => {
  const project = newProject();
  const rotated = await newSigningKey("key-2");
  let published = jwks(key);
  const calls = supabase(() => serving(published)());
  const token = await signToken(rotated, accountClaims(project, "user-rotated", T0));

  await verifyAccountToken(await signToken(key, accountClaims(project, "user-warm", T0)), project, T0);
  assert.equal(calls.length, 1);

  assert.equal(await verifyAccountToken(token, project, T0 + MINUTE), null);
  assert.equal(calls.length, 2, "an unknown kid refetches");
  assert.equal(await verifyAccountToken(token, project, T0 + MINUTE + 1000), null);
  assert.equal(calls.length, 2, "but not again straight away");

  // Once Supabase publishes the rotated key, the next refetch picks it up.
  published = jwks(key, rotated);
  assert.equal(await verifyAccountToken(token, project, T0 + 2 * MINUTE), "user-rotated");
  assert.equal(calls.length, 3);
});

test("caches the keys for ten minutes", async () => {
  const project = newProject();
  const calls = supabase(serving(jwks(key)));
  const token = await signToken(key, accountClaims(project, "user-cached", T0));
  assert.equal(await verifyAccountToken(token, project, T0), "user-cached");
  assert.equal(await verifyAccountToken(token, project, T0 + 10 * MINUTE - 1), "user-cached");
  assert.equal(calls.length, 1);
  assert.equal(await verifyAccountToken(token, project, T0 + 10 * MINUTE), "user-cached");
  assert.equal(calls.length, 2);
});

test("keeps the keys it has when Supabase can't be reached, and refuses when it has none", async () => {
  const project = newProject();
  const token = await signToken(key, accountClaims(project, "user-outage", T0));
  supabase(serving(jwks(key)));
  assert.equal(await verifyAccountToken(token, project, T0), "user-outage");

  const logged = quietErrors();
  for (const [i, reply] of [
    () => new Response("", { status: 503 }),
    () => Promise.reject(new TypeError("network down")),
    serving({ keys: [] }),
  ].entries()) {
    supabase(reply);
    const at = T0 + (i + 1) * 10 * MINUTE;
    assert.equal(await verifyAccountToken(token, project, at), "user-outage", String(i));
  }
  assert.equal(logged.length, 3);

  const coldProject = newProject();
  supabase(() => Promise.reject(new TypeError("network down")));
  const coldToken = await signToken(key, accountClaims(coldProject, "user-cold", T0));
  assert.equal(await verifyAccountToken(coldToken, coldProject, T0), null);
});

test("refuses malformed tokens without calling Supabase", async () => {
  const project = newProject();
  const calls = supabase(serving(jwks(key)));
  const claims = accountClaims(project, "user-bad", T0);
  const { sub: _sub, ...noSub } = claims;
  const { exp: _exp, ...noExp } = claims;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: key.kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = (await signToken(key, claims)).split(".")[2];

  for (const token of [
    "",
    "not-a-jwt",
    "a.b",
    `${header}.${payload}.${signature}.extra`,
    "!!!.###.$$$",
    `${b64url("not json")}.${payload}.${signature}`,
    `${b64url("[]")}.${payload}.${signature}`,
    `${b64url(JSON.stringify({ alg: "ES256" }))}.${payload}.${signature}`, // no kid
    `${header}.${payload}.${b64url(new Uint8Array(32))}`, // signature too short
    `${b64url(JSON.stringify({ alg: "ES256", kid: key.kid, crit: ["x"] }))}.${payload}.${signature}`,
    await signToken(key, noSub),
    await signToken(key, noExp),
    await signToken(key, { ...claims, exp: String(claims.exp) }),
    await signToken(key, { ...claims, sub: 42 }),
  ]) {
    assert.equal(await verifyAccountToken(token, project, T0), null, token);
  }
  assert.equal(calls.length, 0);
});
