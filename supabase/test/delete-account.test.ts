/**
 * handleDeleteAccount with stubbed deps. Run from the repo root with
 * `node --experimental-strip-types --test supabase/test/*.test.ts`.
 *
 * Every dep records its call in `calls`, so each case can assert both what
 * ran and, as importantly, what never ran after a failing step.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { handleDeleteAccount, type DeleteDeps } from "../functions/delete-account/handler.ts";

const ALICE = { id: "11111111-1111-4111-8111-111111111111", provider: "apple" };
const BOB = { id: "22222222-2222-4222-8222-222222222222", provider: "google" };
const FN_URL = "https://p.supabase.test/functions/v1/delete-account";

let calls: string[];

function deps(overrides: Partial<DeleteDeps> = {}): DeleteDeps {
  return {
    userFromToken: async (token) => {
      calls.push(`userFromToken:${token}`);
      return token === "alice-token" ? ALICE : null;
    },
    findUser: async (q) => {
      calls.push(`findUser:${JSON.stringify(q)}`);
      if (q.email === "bob@x.com" || q.id === BOB.id) return BOB;
      return null;
    },
    appleRefreshToken: async (userId) => {
      calls.push(`appleRefreshToken:${userId}`);
      return userId === ALICE.id ? "apple-refresh" : null;
    },
    revokeApple: async (token) => {
      calls.push(`revokeApple:${token}`);
    },
    deleteRevenueCatCustomer: async (userId) => {
      calls.push(`revenueCat:${userId}`);
    },
    deleteAuthUser: async (userId) => {
      calls.push(`deleteAuthUser:${userId}`);
    },
    adminSecret: "s3cret",
    ...overrides,
  };
}

const callerRequest = (token?: string) =>
  new Request(FN_URL, {
    method: "POST",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

const adminRequest = (secret: string, body: unknown) =>
  new Request(FN_URL, {
    method: "POST",
    headers: { "x-admin-secret": secret, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const steps = () => calls.filter((c) => !c.startsWith("userFromToken") && !c.startsWith("findUser"));

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

test("a caller token deletes in order: Apple revoke, RevenueCat, then the auth user", async () => {
  const res = await handleDeleteAccount(callerRequest("alice-token"), deps());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true });
  assert.deepEqual(steps(), [
    `appleRefreshToken:${ALICE.id}`,
    "revokeApple:apple-refresh",
    `revenueCat:${ALICE.id}`,
    `deleteAuthUser:${ALICE.id}`,
  ]);
});

test("no stored Apple token skips the revoke and still deletes", async () => {
  const res = await handleDeleteAccount(adminRequest("s3cret", { id: BOB.id }), deps());
  assert.equal(res.status, 200);
  assert.deepEqual(steps(), [`appleRefreshToken:${BOB.id}`, `revenueCat:${BOB.id}`, `deleteAuthUser:${BOB.id}`]);
});

test("no token is 401 and deletes nothing", async () => {
  const res = await handleDeleteAccount(callerRequest(), deps());
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("an invalid token is 401 and deletes nothing", async () => {
  const res = await handleDeleteAccount(callerRequest("forged"), deps());
  assert.equal(res.status, 401);
  assert.deepEqual(steps(), []);
});

test("a RevenueCat failure is 502 and the auth user is not deleted", async () => {
  const res = await quietly(() =>
    handleDeleteAccount(
      callerRequest("alice-token"),
      deps({
        deleteRevenueCatCustomer: async () => {
          calls.push("revenueCat");
          throw new Error("rc down");
        },
      }),
    ),
  );
  assert.equal(res.status, 502);
  assert.deepEqual(steps(), [`appleRefreshToken:${ALICE.id}`, "revokeApple:apple-refresh", "revenueCat"]);
});

test("an Apple revoke failure is 502 and nothing after it runs", async () => {
  const res = await quietly(() =>
    handleDeleteAccount(
      callerRequest("alice-token"),
      deps({
        revokeApple: async () => {
          calls.push("revokeApple");
          throw new Error("apple credentials not configured");
        },
      }),
    ),
  );
  assert.equal(res.status, 502);
  assert.deepEqual(steps(), [`appleRefreshToken:${ALICE.id}`, "revokeApple"]);
});

test("an auth-user delete failure is 502", async () => {
  const res = await quietly(() =>
    handleDeleteAccount(
      callerRequest("alice-token"),
      deps({
        deleteAuthUser: async () => {
          throw new Error("db down");
        },
      }),
    ),
  );
  assert.equal(res.status, 502);
});

test("the admin path with a wrong secret is 401 and looks nobody up", async () => {
  const res = await handleDeleteAccount(adminRequest("guess", { email: "bob@x.com" }), deps());
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("the admin path is closed when no admin secret is configured", async () => {
  const res = await handleDeleteAccount(adminRequest("", { email: "bob@x.com" }), deps({ adminSecret: null }));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("the admin path with the right secret and an email deletes that user", async () => {
  const res = await handleDeleteAccount(adminRequest("s3cret", { email: "bob@x.com" }), deps());
  assert.equal(res.status, 200);
  assert.deepEqual(calls[0], 'findUser:{"email":"bob@x.com"}');
  assert.equal(calls.at(-1), `deleteAuthUser:${BOB.id}`);
});

test("the admin path without an id or email is 400", async () => {
  const res = await handleDeleteAccount(adminRequest("s3cret", {}), deps());
  assert.equal(res.status, 400);
  assert.deepEqual(calls, []);
});

test("a user that isn't found is 404 and deletes nothing", async () => {
  const res = await handleDeleteAccount(adminRequest("s3cret", { email: "nobody@x.com" }), deps());
  assert.equal(res.status, 404);
  assert.deepEqual(steps(), []);
});

test("a CORS preflight is answered without touching any dep", async () => {
  const res = await handleDeleteAccount(new Request(FN_URL, { method: "OPTIONS" }), deps());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /authorization/);
  assert.deepEqual(calls, []);
});
