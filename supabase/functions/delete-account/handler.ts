/**
 * DELETE ACCOUNT — request handling
 *
 * Two ways in:
 *   - the app: `Authorization: Bearer <access token>` deletes the caller;
 *   - the owner script: `x-admin-secret` plus a JSON body `{ id }` or
 *     `{ email }` deletes that account (support requests by email).
 *
 * Steps run in a fixed order: revoke the stored Apple token (if any), delete
 * the RevenueCat customer, then delete the auth user, whose foreign keys
 * cascade to every per-user table. The auth user goes last and any failing
 * step returns 502 with nothing after it run, so a retry finds the account
 * still there and can finish the job.
 *
 * Everything that touches the outside world comes in through `DeleteDeps`
 * (wired in index.ts), so this file runs unchanged under Node's tests.
 */

import type { AppleGrant } from "../_shared/apple.ts";
import { bearerToken, CORS, json } from "../_shared/http.ts";

export interface AccountRef {
  id: string;
  /** app_metadata.provider: "google" | "apple" | … */
  provider: string;
}

export interface DeleteDeps {
  /** The account an access token belongs to; null when it isn't valid. */
  userFromToken(token: string): Promise<AccountRef | null>;
  findUser(q: { id?: string; email?: string }): Promise<AccountRef | null>;
  /** The stored Apple token; only the native iOS sign-in stores one. */
  appleRefreshToken(userId: string): Promise<AppleGrant | null>;
  revokeApple(grant: AppleGrant): Promise<void>;
  /** Resolves when the customer is gone, including when it never existed. */
  deleteRevenueCatCustomer(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  /** Null closes the admin path. */
  adminSecret: string | null;
}

function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

type Target = { account: AccountRef } | { refuse: Response };

async function adminTarget(req: Request, given: string, deps: DeleteDeps): Promise<Target> {
  if (!deps.adminSecret || !sameSecret(given, deps.adminSecret)) {
    return { refuse: json(401, { error: "unauthorized" }) };
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown; email?: unknown } | null;
  const id = typeof body?.id === "string" && body.id ? body.id : undefined;
  const email = typeof body?.email === "string" && body.email ? body.email : undefined;
  if (!id && !email) return { refuse: json(400, { error: "id or email required" }) };
  const account = await deps.findUser(id ? { id } : { email });
  return account ? { account } : { refuse: json(404, { error: "user not found" }) };
}

async function callerTarget(req: Request, deps: DeleteDeps): Promise<Target> {
  const token = bearerToken(req);
  const account = token ? await deps.userFromToken(token) : null;
  return account ? { account } : { refuse: json(401, { error: "unauthorized" }) };
}

export async function handleDeleteAccount(req: Request, deps: DeleteDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let target: Target;
  try {
    const adminHeader = req.headers.get("x-admin-secret");
    target = adminHeader !== null ? await adminTarget(req, adminHeader, deps) : await callerTarget(req, deps);
  } catch (err) {
    console.error("[delete-account] looking up the account failed", err);
    return json(502, { error: "lookup failed" });
  }
  if ("refuse" in target) return target.refuse;
  const { id } = target.account;

  let step = "apple";
  try {
    // Any account may hold an Apple token (a linked identity), not only one
    // whose first provider was Apple, so the stored token decides.
    // Android's web-flow sign-in stores none, so those accounts skip this.
    const appleGrant = await deps.appleRefreshToken(id);
    if (appleGrant) await deps.revokeApple(appleGrant);
    step = "revenuecat";
    await deps.deleteRevenueCatCustomer(id);
    step = "auth";
    await deps.deleteAuthUser(id);
  } catch (err) {
    console.error(`[delete-account] ${step} step failed for ${id}`, err);
    return json(502, { error: `${step} step failed` });
  }
  return json(200, { deleted: true });
}
