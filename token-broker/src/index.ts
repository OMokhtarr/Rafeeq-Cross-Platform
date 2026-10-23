/**
 * Quran Foundation OAuth2 & Content token broker, plus speech-to-text keys
 * (Deepgram ephemeral tokens, Soniox temporary API keys).
 *
 * Runs as a Cloudflare Worker. Holds the client_id/secret as Worker secrets,
 * and can exchange:
 *   - Client credentials for a machine‑to‑machine content token (default)
 *   - Authorization code for a user access token ( /oauth2/token )
 *   - The Deepgram API key for a short‑lived JWT ( /deepgram/token )
 *   - The Soniox API key for a short‑lived temporary key ( /soniox/token )
 *
 * Deploy:
 *   wrangler secret put QF_CLIENT_ID
 *   wrangler secret put QF_CLIENT_SECRET
 *   wrangler secret put QF_TOKEN_URL        # e.g. https://oauth2.quran.foundation/oauth2/token
 *   wrangler secret put QF_OAUTH_CLIENT_ID  # (optional) same as QF_CLIENT_ID for OAuth2
 *   wrangler secret put DEEPGRAM_API_KEY    # for recite mode's speech-to-text
 *   wrangler secret put SONIOX_API_KEY      # for recite mode's Soniox engine
 *   wrangler secret put REVENUECAT_SECRET_KEY # Rafeeq Pro check (REQUIRE_PRO="true")
 *   wrangler secret put ALLOWED_ORIGIN      # e.g. https://rafeeq.app, http://localhost:3000
 *   wrangler deploy
 */

export interface Env {
  QF_CLIENT_ID: string;
  QF_CLIENT_SECRET: string;
  QF_TOKEN_URL: string; // for client credentials (content)
  QF_OAUTH_CLIENT_ID?: string; // for OAuth2 user login (defaults to QF_CLIENT_ID)
  QF_OAUTH_TOKEN_URL?: string; // defaults to QF_TOKEN_URL
  DEEPGRAM_API_KEY?: string; // recite mode STT; never shipped to the client
  SONIOX_API_KEY?: string; // recite mode Soniox engine; never shipped to the client
  ALLOWED_ORIGIN: string;
  REQUIRE_PRO?: string; // "true" = speech routes are Rafeeq Pro only (wrangler.toml [vars])
  REVENUECAT_SECRET_KEY?: string; // RevenueCat REST secret, for the Pro check
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
      "access-control-allow-headers": "content-type, x-rafeeq-user",
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

    // ── Speech routes: Rafeeq Pro only when REQUIRE_PRO is "true" ─────────
    if (SPEECH_ROUTES.has(url.pathname)) {
      const refused = await requirePro(req, env, corsHeaders);
      if (refused) return refused;
    }

    // ── Deepgram ephemeral token ( /deepgram/token ) ──────────────────────
    if (url.pathname === "/deepgram/token") {
      return handleDeepgramToken(env, corsHeaders);
    }

    // ── Soniox temporary API key ( /soniox/token ) ────────────────────────
    if (url.pathname === "/soniox/token") {
      return handleSonioxToken(env, corsHeaders);
    }

    // ── Unknown paths ─────────────────────────────────────────────────────
    // Anything that is not a known route must 404 rather than fall through to
    // the Content API handler below. That fall-through is how an undeployed
    // /deepgram/token route stayed invisible: the request returned 200 with a
    // Quran Foundation token, which passed every client-side check and was
    // only rejected later, by Deepgram, as a generic socket close.
    //
    // "/" stays valid: quran-api.client.ts POSTs the bare broker URL for
    // content tokens, and network.service.ts probes it for reachability.
    if (url.pathname !== "/" && url.pathname !== "") {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
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

// ─── Rafeeq Pro check ────────────────────────────────────────────────────────

/** Routes that spend paid speech-engine time. */
const SPEECH_ROUTES = new Set(["/deepgram/token", "/soniox/token"]);

/** How long a "yes, subscribed" answer is trusted before asking RevenueCat
 *  again. Each recite session asks for a new speech token, so this keeps
 *  RevenueCat calls to about one per subscriber every few minutes. */
const PRO_CACHE_MS = 5 * 60 * 1000;

/** The Rafeeq Pro entitlement id in the RevenueCat dashboard (and the app's
 *  PRO_ENTITLEMENT). */
const PRO_ENTITLEMENT = "com_rafeeq_quranquiz_pro";

/** app-user id → time (ms) its Pro answer stops being trusted. Only Pro
 *  answers are cached: a "not Pro" answer from a minute ago must never block
 *  someone who has just bought. Per isolate — a cold isolate just asks again. */
const proCache = new Map<string, number>();

/** Caches a Pro answer, first dropping every answer that has run out, so a
 *  long-lived isolate doesn't keep one entry per subscriber it ever saw. */
function rememberPro(id: string, nowMs: number): void {
  for (const [cachedId, until] of proCache) {
    if (until <= nowMs) proCache.delete(cachedId);
  }
  proCache.set(id, nowMs + PRO_CACHE_MS);
}

interface RevenueCatSubscriber {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
    subscriptions?: Record<string, { grace_period_expires_date?: string | null }>;
  };
}

/**
 * True when a RevenueCat `GET /v1/subscribers/{id}` body shows an active
 * Rafeeq Pro entitlement: present, and either never expiring (lifetime/promo),
 * expiring after `nowMs`, or past its expiry but inside the store's billing
 * grace period. RevenueCat keeps grace-period subscribers' access, but marks
 * the grace period on the subscription (`grace_period_expires_date`), not on
 * the entitlement, so both are read.
 */
function isProSubscriber(body: unknown, nowMs: number): boolean {
  const subscriber = (body as RevenueCatSubscriber | null)?.subscriber;
  const pro = subscriber?.entitlements?.[PRO_ENTITLEMENT];
  if (!pro) return false;
  if (pro.expires_date == null) return true;
  if (Date.parse(pro.expires_date) > nowMs) return true;
  const graceUntil = pro.product_identifier
    ? subscriber?.subscriptions?.[pro.product_identifier]?.grace_period_expires_date
    : null;
  return graceUntil != null && Date.parse(graceUntil) > nowMs;
}

/** RevenueCat app-user ids — anonymous ("$RCAnonymousID:<hex>") or custom —
 *  use these characters. Anything else, or "." / "..", is refused before it
 *  can shape the RevenueCat URL. */
function isPlausibleAppUserId(id: string): boolean {
  return /^[A-Za-z0-9_$:.-]{1,100}$/.test(id) && id !== "." && id !== "..";
}

/**
 * Null when the request may use a speech route; otherwise the 402 to send.
 *
 * Off unless REQUIRE_PRO is exactly "true", so the owner turns enforcement
 * on only once store purchases work. The app sends its RevenueCat app-user id
 * as `x-rafeeq-user`. Only a real RevenueCat outage — the request throwing
 * or a 5xx — lets the request through (logged), so an outage there doesn't
 * lock out paying users. Everything else refuses: a malformed id, a missing
 * or wrong secret (401), a crafted id RevenueCat rejects (4xx), or its rate
 * limit (429), so neither a crafted header nor a misconfigured deploy can
 * quietly turn enforcement off.
 */
async function requirePro(
  req: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (env.REQUIRE_PRO !== "true") return null;

  const refuse = () =>
    new Response(JSON.stringify({ error: "subscription required", code: "not_subscribed" }), {
      status: 402,
      headers: { "content-type": "application/json", ...corsHeaders },
    });

  const id = req.headers.get("x-rafeeq-user");
  if (!id || !isPlausibleAppUserId(id)) return refuse();

  const now = Date.now();
  const trustedUntil = proCache.get(id);
  if (trustedUntil !== undefined && trustedUntil > now) return null;

  if (!env.REVENUECAT_SECRET_KEY) {
    console.error("REQUIRE_PRO is on but REVENUECAT_SECRET_KEY is not set; refusing");
    return refuse();
  }

  let res: Response;
  try {
    res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}` },
    });
  } catch (err) {
    console.error("RevenueCat check threw; allowing", err);
    return null;
  }
  if (res.status >= 500) {
    console.error("RevenueCat check failed; allowing", res.status);
    return null;
  }
  if (!res.ok) {
    console.error("RevenueCat check refused the request; refusing", res.status);
    return refuse();
  }

  if (!isProSubscriber(await res.json(), now)) return refuse();
  rememberPro(id, now);
  return null;
}

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

/**
 * Mint a short-lived Deepgram JWT for recite mode.
 *
 * The real DEEPGRAM_API_KEY stays a Worker secret. Previously it was inlined into
 * the JS bundle by CRA and sent as a WebSocket subprotocol, which made it
 * extractable from any installed APK — anyone could bill recitation minutes to
 * this account.
 *
 * Deepgram's grant endpoint returns a JWT that is only needed for the initial
 * WebSocket handshake; the socket then stays open as normal. The default TTL is
 * 30s, which is plenty — the client fetches one immediately before connecting.
 * Deliberately NOT cached: these are per-connection and short-lived by design.
 */
async function handleDeepgramToken(
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!env.DEEPGRAM_API_KEY) {
    return new Response(JSON.stringify({ error: "STT not configured" }), {
      status: 503,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "content-type": "application/json",
      },
      // 60s: comfortably covers a slow handshake without widening the window
      // much if a token is ever intercepted.
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Deepgram grant error", res.status, text);
      // The upstream message is still withheld — it can leak key state. The
      // status alone does not, and naming it turns three failures that were
      // indistinguishable from the client (bad key, insufficient scope, and
      // the fetch throwing) into one glance: 401 rotate the key, 403 the key
      // lacks grant permission, 402 the account balance is empty.
      return new Response(
        JSON.stringify({
          error: "token grant failed",
          code: `upstream_${res.status}`,
        }),
        {
          status: 502,
          headers: { "content-type": "application/json", ...corsHeaders },
        },
      );
    }

    const tok = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };

    return new Response(
      JSON.stringify({
        access_token: tok.access_token,
        expires_in: tok.expires_in ?? 30,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          // Never let a CDN or the browser reuse a one-shot credential.
          "cache-control": "no-store",
          ...corsHeaders,
        },
      },
    );
  } catch (err) {
    console.error("Deepgram grant threw", err);
    // Distinct from upstream_*: we never got a response at all, so this is a
    // network/runtime fault on our side rather than a credential problem.
    return new Response(
      JSON.stringify({ error: "token grant failed", code: "grant_threw" }),
      {
        status: 502,
        headers: { "content-type": "application/json", ...corsHeaders },
      },
    );
  }
}

/**
 * Mint a temporary Soniox API key for recite mode.
 *
 * Same reasoning as handleDeepgramToken: the real SONIOX_API_KEY stays a
 * Worker secret. The temporary key is scoped to one websocket transcription,
 * single-use, and expires in 60s — it is only needed for the handshake, after
 * which the socket stays open as normal. Not cached, for the same reason.
 */
async function handleSonioxToken(
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!env.SONIOX_API_KEY) {
    return new Response(JSON.stringify({ error: "STT not configured" }), {
      status: 503,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  try {
    const res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.SONIOX_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: 60,
        single_use: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Soniox temporary key error", res.status, text);
      // Upstream body withheld from the client, status named — see
      // handleDeepgramToken.
      return new Response(
        JSON.stringify({
          error: "token grant failed",
          code: `upstream_${res.status}`,
        }),
        {
          status: 502,
          headers: { "content-type": "application/json", ...corsHeaders },
        },
      );
    }

    const tok = (await res.json()) as { api_key: string; expires_at?: string };

    // Renamed to access_token so the client reads every engine's credential
    // the same way (stt/broker.ts fetchBrokerKey).
    return new Response(
      JSON.stringify({ access_token: tok.api_key, expires_in: 60 }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          // Never let a CDN or the browser reuse a one-shot credential.
          "cache-control": "no-store",
          ...corsHeaders,
        },
      },
    );
  } catch (err) {
    console.error("Soniox temporary key threw", err);
    return new Response(
      JSON.stringify({ error: "token grant failed", code: "grant_threw" }),
      {
        status: 502,
        headers: { "content-type": "application/json", ...corsHeaders },
      },
    );
  }
}

function json(data: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...extra },
  });
}
