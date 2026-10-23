/**
 * The broker's Rafeeq Pro check, end to end through the Worker's fetch
 * handler with RevenueCat's API stubbed. Run with `npm test` in token-broker/
 * (Node 22.6+ runs this TypeScript directly).
 *
 * /soniox/token without SONIOX_API_KEY answers 503 "STT not configured", so a
 * 503 means "the Pro check let the request through" and a 402 means it
 * refused. The Pro cache is module-level and shared by every case here, so
 * each case uses its own app-user id.
 */

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const realFetch = globalThis.fetch;
const realNow = Date.now;
const HOUR = 60 * 60 * 1000;

afterEach(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
});

const env = (overrides: Record<string, unknown> = {}) =>
  ({
    ALLOWED_ORIGIN: "https://rafeeq.app",
    REQUIRE_PRO: "true",
    REVENUECAT_SECRET_KEY: "sk_test",
    ...overrides,
  }) as never;

const speech = (id?: string, path = "/soniox/token") =>
  new Request(`https://broker.test${path}`, {
    method: "POST",
    headers: id ? { "x-rafeeq-user": id } : {},
  });

const iso = (offsetMs: number) => new Date(realNow() + offsetMs).toISOString();

/** Stubs RevenueCat, recording each subscriber lookup. */
function revenueCat(reply: () => Response | Promise<Response>): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return reply();
  }) as typeof fetch;
  return calls;
}

const subscriber = (pro: object | undefined, subscriptions: object = {}) => () =>
  new Response(
    JSON.stringify({
      subscriber: { entitlements: pro ? { com_rafeeq_quranquiz_pro: pro } : {}, subscriptions },
    }),
    { status: 200 },
  );

test("REQUIRE_PRO off: speech routes are open and RevenueCat is never asked", async () => {
  const calls = revenueCat(subscriber(undefined));
  const res = await worker.fetch(speech(), env({ REQUIRE_PRO: "false" }));
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

test("refuses a request without an app-user id", async () => {
  const res = await worker.fetch(speech(), env());
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), { error: "subscription required", code: "not_subscribed" });
});

test("refuses a malformed app-user id before it reaches RevenueCat", async () => {
  const calls = revenueCat(subscriber({ expires_date: null }));
  for (const id of ["..", ".", "a/b", "x".repeat(101)]) {
    assert.equal((await worker.fetch(speech(id), env())).status, 402, id);
  }
  assert.equal(calls.length, 0);
});

test("refuses when the RevenueCat secret is missing", async () => {
  const res = await worker.fetch(speech("$RCAnonymousID:nosecret"), env({ REVENUECAT_SECRET_KEY: "" }));
  assert.equal(res.status, 402);
});

test("lets an active subscriber through, asking RevenueCat with the encoded id", async () => {
  const calls = revenueCat(subscriber({ expires_date: iso(HOUR) }));
  const res = await worker.fetch(speech("$RCAnonymousID:active"), env());
  assert.equal(res.status, 503);
  assert.deepEqual(calls, ["https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aactive"]);
});

test("lets a never-expiring (lifetime or promotional) entitlement through", async () => {
  revenueCat(subscriber({ expires_date: null }));
  assert.equal((await worker.fetch(speech("$RCAnonymousID:lifetime"), env())).status, 503);
});

test("refuses an expired entitlement", async () => {
  revenueCat(subscriber({ expires_date: iso(-HOUR) }));
  assert.equal((await worker.fetch(speech("$RCAnonymousID:expired"), env())).status, 402);
});

test("refuses someone with no pro entitlement", async () => {
  revenueCat(subscriber(undefined));
  assert.equal((await worker.fetch(speech("$RCAnonymousID:free"), env())).status, 402);
});

test("lets an expired entitlement through while its store grace period lasts", async () => {
  revenueCat(
    subscriber(
      { expires_date: iso(-HOUR), product_identifier: "rafeeq_pro:monthly" },
      { "rafeeq_pro:monthly": { grace_period_expires_date: iso(HOUR) } },
    ),
  );
  assert.equal((await worker.fetch(speech("$RCAnonymousID:grace"), env())).status, 503);
});

test("refuses once the grace period has ended too", async () => {
  revenueCat(
    subscriber(
      { expires_date: iso(-2 * HOUR), product_identifier: "rafeeq_pro:monthly" },
      { "rafeeq_pro:monthly": { grace_period_expires_date: iso(-HOUR) } },
    ),
  );
  assert.equal((await worker.fetch(speech("$RCAnonymousID:graceover"), env())).status, 402);
});

test("a grace period on a different product doesn't count", async () => {
  revenueCat(
    subscriber(
      { expires_date: iso(-HOUR), product_identifier: "rafeeq_pro:monthly" },
      { "other:product": { grace_period_expires_date: iso(HOUR) } },
    ),
  );
  assert.equal((await worker.fetch(speech("$RCAnonymousID:othergrace"), env())).status, 402);
});

test("fails open when RevenueCat can't be reached", async () => {
  revenueCat(() => Promise.reject(new TypeError("network down")));
  assert.equal((await worker.fetch(speech("$RCAnonymousID:outage"), env())).status, 503);
});

test("fails open on a RevenueCat 5xx", async () => {
  revenueCat(() => new Response("", { status: 502 }));
  assert.equal((await worker.fetch(speech("$RCAnonymousID:5xx"), env())).status, 503);
});

test("refuses on a RevenueCat 4xx (wrong secret, rejected id) and its rate limit", async () => {
  for (const status of [401, 404, 429]) {
    revenueCat(() => new Response("", { status }));
    assert.equal((await worker.fetch(speech(`$RCAnonymousID:status${status}`), env())).status, 402, String(status));
  }
});

test("caches a Pro answer for five minutes, then asks again", async () => {
  const calls = revenueCat(subscriber({ expires_date: null }));
  const id = "$RCAnonymousID:cached";
  const start = realNow();
  Date.now = () => start;
  await worker.fetch(speech(id), env());
  await worker.fetch(speech(id, "/whisper/transcribe"), env());
  assert.equal(calls.length, 1);
  Date.now = () => start + 5 * 60 * 1000 + 1;
  await worker.fetch(speech(id), env());
  assert.equal(calls.length, 2);
});

test("never caches a not-Pro answer, so a new purchase works at once", async () => {
  const id = "$RCAnonymousID:justbought";
  revenueCat(subscriber(undefined));
  assert.equal((await worker.fetch(speech(id), env())).status, 402);
  revenueCat(subscriber({ expires_date: iso(HOUR) }));
  assert.equal((await worker.fetch(speech(id), env())).status, 503);
});

test("routes that don't spend speech time aren't gated", async () => {
  const res = await worker.fetch(speech(undefined, "/nope"), env());
  assert.equal(res.status, 404);
});

test("CORS preflight allows the x-rafeeq-user header", async () => {
  const res = await worker.fetch(
    new Request("https://broker.test/soniox/token", { method: "OPTIONS" }),
    env(),
  );
  assert.equal(res.status, 204);
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /x-rafeeq-user/);
});
