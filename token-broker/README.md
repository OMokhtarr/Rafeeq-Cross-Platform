# Rafeeq token broker

A tiny Cloudflare Worker that exchanges the Quran Foundation `client_id` /
`client_secret` for a short-lived OAuth2 access token, and returns it to the
Rafeeq app. The credentials live as Worker secrets — they are never in the
mobile app bundle.

## One-time setup

```bash
npm install
npx wrangler login
npx wrangler secret put QF_CLIENT_ID
npx wrangler secret put QF_CLIENT_SECRET
npx wrangler secret put QF_TOKEN_URL
# value: https://prelive-oauth2.quran.foundation/oauth2/token
npx wrangler secret put ALLOWED_ORIGIN
# comma-separated. examples:
#   http://localhost:3000,capacitor://localhost,https://localhost
```

## Deploy

```bash
npm run deploy
```

Wrangler will print a URL like `https://rafeeq-token-broker.<you>.workers.dev`.
Put that in the app's `.env.local` as `REACT_APP_TOKEN_BROKER_URL`.

## How the app uses it

```
[Rafeeq app] --POST--> [token-broker] --Basic auth--> [Quran Foundation OAuth2]
                                  <-- access_token --
        <-- access_token --
```

The Worker holds an in-memory cache of the current token; if a token has more
than 60 seconds of life left when a new request arrives, the cached one is
returned. The Foundation tokens are typically valid for one hour.

## Rafeeq Pro check on the speech routes

`/deepgram/token` and `/soniox/token` mint recite-mode speech keys. When
`REQUIRE_PRO = "true"` in `wrangler.toml`, they answer 402 `not_subscribed`
unless the request comes from a Rafeeq Pro account:

1. The app sends its account token: `authorization: Bearer <Supabase access token>`.
2. The Worker verifies it (`src/account-token.ts`): an ES256 signature by one
   of the keys published at `$SUPABASE_URL/auth/v1/.well-known/jwks.json`,
   `iss` = `$SUPABASE_URL/auth/v1`, `aud` = `authenticated`, not expired. The
   keys are cached for 10 minutes, so this normally costs no network call.
3. The token's `sub` (the account id) is the RevenueCat app-user id, and
   RevenueCat must report the `com_rafeeq_quranquiz_pro` entitlement as active.

Set `SUPABASE_URL` (a `[vars]` entry, not a secret) and the
`REVENUECAT_SECRET_KEY` secret before turning `REQUIRE_PRO` on, for the prod
Worker and again for `--env dev`. The Supabase project must use asymmetric
(ES256) JWT signing keys; tokens signed with the legacy shared secret (HS256)
are refused.

After a deploy, check the routes with a Pro account's token:

```bash
PRO_TOKEN=<access token of a signed-in Pro account> bash verify-deploy.sh
```

Supabase access tokens expire after an hour by default, so use a fresh one.

## Tests

```bash
npm test
```

Runs the tests in `test/` with Node's built-in test runner (Node 22.6+); no
`npm install` needed.

## Rotating credentials

If `QF_CLIENT_SECRET` ever leaks: regenerate it in the Foundation portal, then
`wrangler secret put QF_CLIENT_SECRET` with the new value. The next call will
pick it up. No app redeploy required.
