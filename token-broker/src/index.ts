/**
 * Quran Foundation OAuth2 & Content token broker.
 *
 * Runs as a Cloudflare Worker. Holds the client_id/secret as Worker secrets,
 * and can exchange:
 *   - Client credentials for a machine‑to‑machine content token (default)
 *   - Authorization code for a user access token ( /oauth2/token )
 *
 * Deploy:
 *   wrangler secret put QF_CLIENT_ID
 *   wrangler secret put QF_CLIENT_SECRET
 *   wrangler secret put QF_TOKEN_URL        # e.g. https://oauth2.quran.foundation/oauth2/token
 *   wrangler secret put QF_OAUTH_CLIENT_ID  # (optional) same as QF_CLIENT_ID for OAuth2
 *   wrangler secret put ALLOWED_ORIGIN      # e.g. https://rafeeq.app, http://localhost:3000
 *   wrangler deploy
 */

export interface Env {
  QF_CLIENT_ID: string;
  QF_CLIENT_SECRET: string;
  QF_TOKEN_URL: string; // for client credentials (content)
  QF_OAUTH_CLIENT_ID?: string; // for OAuth2 user login (defaults to QF_CLIENT_ID)
  QF_OAUTH_TOKEN_URL?: string; // defaults to QF_TOKEN_URL
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
      return new Response("method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    const url = new URL(req.url);

    // ── OAuth2 User Token Exchange ( /oauth2/token ) ──────────────────────
    if (url.pathname === "/oauth2/token") {
      return handleOAuthToken(req, env, corsHeaders);
    }

    // ── Default: Content API client credentials ───────────────────────────
    const now = Math.floor(Date.now() / 1000);
    if (cache && cache.expires_at - 60 > now) {
      return json(
        {
          access_token: cache.access_token,
          expires_in: cache.expires_at - now,
        },
        corsHeaders,
      );
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
      return new Response(`upstream ${res.status}: ${text}`, {
        status: 502,
        headers: corsHeaders,
      });
    }

    const tok = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    cache = {
      access_token: tok.access_token,
      expires_at: now + tok.expires_in,
    };
    return json(
      { access_token: tok.access_token, expires_in: tok.expires_in },
      corsHeaders,
    );
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function handleOAuthToken(
  req: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const payload = (await req.json()) as {
      code?: string;
      grant_type?: string;
      redirect_uri?: string;
      code_verifier?: string;
      refresh_token?: string;
      client_id?: string;
    };

    const clientId =
      payload.client_id || env.QF_OAUTH_CLIENT_ID || env.QF_CLIENT_ID;
    const tokenUrl = env.QF_OAUTH_TOKEN_URL || env.QF_TOKEN_URL;
    const basic = btoa(`${clientId}:${env.QF_CLIENT_SECRET}`);

    const params = new URLSearchParams();

    if (payload.grant_type === "refresh_token") {
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", payload.refresh_token || "");
    } else {
      params.set("grant_type", "authorization_code");
      params.set("code", payload.code || "");
      params.set("redirect_uri", payload.redirect_uri || "");
      params.set("code_verifier", payload.code_verifier || "");
    }

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("OAuth token error", JSON.stringify(data));
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
}

function json(data: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...extra },
  });
}
