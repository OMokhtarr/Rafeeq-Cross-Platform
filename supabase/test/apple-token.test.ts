/**
 * handleAppleToken with stubbed deps. Run from the repo root with
 * `node --experimental-strip-types --test supabase/test/*.test.ts`.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { handleAppleToken, type AppleTokenDeps } from "../functions/apple-token/handler.ts";

const ALICE = { id: "11111111-1111-4111-8111-111111111111" };
const FN_URL = "https://p.supabase.test/functions/v1/apple-token";
const GRANT = { refreshToken: "apple-refresh", clientId: "com.rafeeq.quranquiz" };

let calls: string[];

function deps(overrides: Partial<AppleTokenDeps> = {}): AppleTokenDeps {
  return {
    userFromToken: async (token) => {
      calls.push(`userFromToken:${token}`);
      return token === "alice-token" ? ALICE : null;
    },
    exchangeAppleCode: async (code) => {
      calls.push(`exchange:${code}`);
      return GRANT;
    },
    saveRefreshToken: async (userId, grant) => {
      calls.push(`save:${userId}:${grant.refreshToken}@${grant.clientId}`);
    },
    ...overrides,
  };
}

const post = (token: string | undefined, body: unknown) =>
  new Request(FN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const realError = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = realError;
  }
};

beforeEach(() => {
  calls = [];
});

test("the exchanged token is saved, with its client id, for the caller", async () => {
  const res = await handleAppleToken(post("alice-token", { authorizationCode: "code-1" }), deps());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { saved: true });
  assert.deepEqual(calls, [
    "userFromToken:alice-token",
    "exchange:code-1",
    `save:${ALICE.id}:apple-refresh@com.rafeeq.quranquiz`,
  ]);
});

test("no token is 401 and exchanges nothing", async () => {
  const res = await handleAppleToken(post(undefined, { authorizationCode: "code-1" }), deps());
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("an invalid token is 401 and exchanges nothing", async () => {
  const res = await handleAppleToken(post("forged", { authorizationCode: "code-1" }), deps());
  assert.equal(res.status, 401);
  assert.deepEqual(calls, ["userFromToken:forged"]);
});

test("a body without an authorization code is 400", async () => {
  const res = await handleAppleToken(post("alice-token", {}), deps());
  assert.equal(res.status, 400);
  assert.deepEqual(calls, ["userFromToken:alice-token"]);
});

test("a failed exchange is 502 and nothing is saved", async () => {
  const res = await quietly(() =>
    handleAppleToken(
      post("alice-token", { authorizationCode: "bad" }),
      deps({
        exchangeAppleCode: async () => {
          throw new Error("apple /auth/token failed: 400");
        },
      }),
    ),
  );
  assert.equal(res.status, 502);
  assert.deepEqual(calls, ["userFromToken:alice-token"]);
});

test("a failed save is 502", async () => {
  const res = await quietly(() =>
    handleAppleToken(
      post("alice-token", { authorizationCode: "code-1" }),
      deps({
        saveRefreshToken: async () => {
          throw new Error("db down");
        },
      }),
    ),
  );
  assert.equal(res.status, 502);
});

test("a CORS preflight is answered without touching any dep", async () => {
  const res = await handleAppleToken(new Request(FN_URL, { method: "OPTIONS" }), deps());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /content-type/);
  assert.deepEqual(calls, []);
});
