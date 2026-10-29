/**
 * Request/response helpers shared by the edge functions the app calls.
 */

// Bearer auth, no cookies, so any origin may call; the token is the gate.
// x-admin-secret is deliberately absent: the admin path is not for browsers.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
};

export const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

/** A 4xx from Auth means "no such user / bad token"; anything else is an outage. */
export const isNotFound = (error: { status?: number }) => !!error.status && error.status < 500;

/** The access token from `Authorization: Bearer <token>`, if present. */
export const bearerToken = (req: Request): string | undefined =>
  /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
