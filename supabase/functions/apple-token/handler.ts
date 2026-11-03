/**
 * APPLE TOKEN — request handling
 *
 * After a native Sign in with Apple the app posts the authorization code
 * Apple gave it, with `Authorization: Bearer <access token>`. The code is
 * exchanged for Apple's refresh token, which is stored (with the client id
 * it was issued to) so delete-account can revoke the grant later.
 *
 * Only the iOS native sign-in posts here. Android signs in with Apple
 * through Supabase's web flow, which never hands the app a code, so those
 * accounts have no stored token and deletion skips the revoke for them.
 *
 * Everything that touches the outside world comes in through
 * `AppleTokenDeps` (wired in index.ts), so this file runs unchanged under
 * Node's tests.
 */

import type { AppleGrant } from "../_shared/apple.ts";
import { bearerToken, CORS, json } from "../_shared/http.ts";

export interface AppleTokenDeps {
  /** The account an access token belongs to; null when it isn't valid. */
  userFromToken(token: string): Promise<{ id: string } | null>;
  exchangeAppleCode(code: string): Promise<AppleGrant>;
  /** Replaces any token already stored for the account. */
  saveRefreshToken(userId: string, grant: AppleGrant): Promise<void>;
}

export async function handleAppleToken(req: Request, deps: AppleTokenDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const token = bearerToken(req);
  if (!token) return json(401, { error: "unauthorized" });

  let step = "lookup";
  try {
    const account = await deps.userFromToken(token);
    if (!account) return json(401, { error: "unauthorized" });

    const body = (await req.json().catch(() => null)) as { authorizationCode?: unknown } | null;
    const code = body?.authorizationCode;
    if (typeof code !== "string" || !code) return json(400, { error: "authorizationCode required" });

    step = "exchange";
    const grant = await deps.exchangeAppleCode(code);
    step = "save";
    await deps.saveRefreshToken(account.id, grant);
  } catch (err) {
    console.error(`[apple-token] ${step} step failed`, err);
    return json(502, { error: `${step} step failed` });
  }
  return json(200, { saved: true });
}
