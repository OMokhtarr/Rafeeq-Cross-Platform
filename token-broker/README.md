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

## Rotating credentials

If `QF_CLIENT_SECRET` ever leaks: regenerate it in the Foundation portal, then
`wrangler secret put QF_CLIENT_SECRET` with the new value. The next call will
pick it up. No app redeploy required.
