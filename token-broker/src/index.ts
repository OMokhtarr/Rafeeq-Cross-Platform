/**
 * Quran Foundation OAuth2 token broker.
 *
 * Runs as a Cloudflare Worker. Holds the client_id/secret as Worker secrets
 * (never bundled into the app), exchanges them for a short-lived access token,
 * and returns it to the app. The app never sees the secret.
 *
 * Deploy:
 *   wrangler secret put QF_CLIENT_ID
 *   wrangler secret put QF_CLIENT_SECRET
 *   wrangler secret put QF_TOKEN_URL    # https://prelive-oauth2.quran.foundation/oauth2/token
 *   wrangler secret put ALLOWED_ORIGIN  # e.g. https://rafeeq.app, or capacitor://localhost
 *   wrangler deploy
 */

export interface Env {
  QF_CLIENT_ID: string;
  QF_CLIENT_SECRET: string;
  QF_TOKEN_URL: string;
  ALLOWED_ORIGIN: string;
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

let cache: CachedToken | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = env.ALLOWED_ORIGIN.split(",").map((s) => s.trim());
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

    const corsHeaders = {
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405, headers: corsHeaders });
    }

    // Serve cached token if still valid (with a 60s safety margin).
    const now = Math.floor(Date.now() / 1000);
    if (cache && cache.expires_at - 60 > now) {
      return json({ access_token: cache.access_token, expires_in: cache.expires_at - now }, corsHeaders);
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "content",
    });
    const basic = btoa(`${env.QF_CLIENT_ID}:${env.QF_CLIENT_SECRET}`);

    const res = await fetch(env.QF_TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(`upstream ${res.status}: ${text}`, { status: 502, headers: corsHeaders });
    }

    const tok = (await res.json()) as { access_token: string; expires_in: number };
    cache = {
      access_token: tok.access_token,
      expires_at: now + tok.expires_in,
    };
    return json({ access_token: tok.access_token, expires_in: tok.expires_in }, corsHeaders);
  },
};

function json(data: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...extra },
  });
}
