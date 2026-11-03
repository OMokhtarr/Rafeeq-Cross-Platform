/**
 * Shared request/response helpers, run from the repo root with
 * `node --experimental-strip-types --test supabase/test/*.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotFound } from "../functions/_shared/http.ts";

test("isNotFound: a 4xx from Auth means no such user, except rate limiting", () => {
  assert.equal(isNotFound({ status: 400 }), true);
  assert.equal(isNotFound({ status: 401 }), true);
  assert.equal(isNotFound({ status: 404 }), true);
  assert.equal(isNotFound({ status: 429 }), false);
});

test("isNotFound: a 5xx or a missing status is an outage", () => {
  assert.equal(isNotFound({ status: 500 }), false);
  assert.equal(isNotFound({ status: 503 }), false);
  assert.equal(isNotFound({}), false);
});
