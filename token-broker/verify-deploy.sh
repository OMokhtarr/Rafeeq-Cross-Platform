#!/usr/bin/env bash
# Verifies the deployed broker actually serves the Deepgram and Soniox routes.
#
# Why this exists: the /deepgram/token route was committed (c18be0b) long before
# it was deployed. An undeployed Worker has no such route, so the request falls
# through to the default handler and returns a QURAN FOUNDATION token instead.
# The call still returns HTTP 200, so liveness checks look fine while recite
# mode is broken — the token is only rejected later, by Deepgram.
#
# Usage:  bash token-broker/verify-deploy.sh
#
#   BROKER_URL=<url>       check another deployment, e.g. the dev copy
#                          (npx wrangler deploy --env dev)
#   PRO_TOKEN=<token>      the Supabase access token of a signed-in account
#                          that has Rafeeq Pro. Needed once REQUIRE_PRO is
#                          "true": the speech routes then refuse requests
#                          without a valid Pro account token. (A bare account
#                          or Support ID no longer works: the broker trusts
#                          only a token Supabase signed.) Access tokens expire
#                          after an hour by default, so use a fresh one.

set -uo pipefail
B="${BROKER_URL:-https://rafeeq-token-broker.rafeeqapp.workers.dev}"

# Account token header for the speech-route checks below.
UH=()
if [ -n "${PRO_TOKEN:-}" ]; then
  UH=(-H "Authorization: Bearer $PRO_TOKEN")
fi

echo "broker: $B"

# Rafeeq Pro enforcement: with REQUIRE_PRO="true" a speech route refuses a
# request without a Pro account token. Informational either way - the switch
# is the owner's to set.
pro_resp=$(curl -s -m 25 -w $'\n%{http_code}' -X POST -H "Origin: https://localhost" "$B/deepgram/token")
pro_code=${pro_resp##*$'\n'}
if [ "$pro_code" = "402" ] && echo "$pro_resp" | grep -q 'not_subscribed'; then
  echo "PASS (enforcement on) — speech routes refuse requests without an account token."
  if [ ${#UH[@]} -eq 0 ]; then
    echo "  The route checks below will be refused too; rerun with PRO_TOKEN=<a Pro account's access token>."
  fi
else
  echo "INFO (enforcement off) — REQUIRE_PRO is not \"true\"; speech routes are open (HTTP $pro_code)."
fi

# Prints the JWT payload of the access_token in a JSON body (empty when it is
# not a JWT). Uses base64/sed rather than node: node is not always on PATH
# (notably when this runs from PowerShell), and a decoder that silently fails
# used to leave the issuer empty, which the check below read as a PASS.
jwt_payload() {
  local b64
  b64=$(echo "$1" | sed 's/.*"access_token":"\([^"]*\)".*/\1/' | cut -d. -f2 | tr '_-' '/+')
  case $(( ${#b64} % 4 )) in
    2) b64="$b64==" ;;
    3) b64="$b64=" ;;
  esac
  echo "$b64" | base64 -d 2>/dev/null
}

body=$(curl -s -m 25 -X POST -H "Origin: https://localhost" ${UH[@]+"${UH[@]}"} "$B/deepgram/token")

if ! echo "$body" | grep -q "access_token"; then
  echo "FAIL — no access_token in response:"
  echo "  $body"
  if echo "$body" | grep -q 'not_subscribed'; then
    if [ -n "${PRO_TOKEN:-}" ]; then
      echo "The broker refused PRO_TOKEN. Check that the token is fresh (access"
      echo "tokens expire), belongs to an account with an active Rafeeq Pro"
      echo "subscription, and comes from the project in the Worker's SUPABASE_URL;"
      echo "and that REVENUECAT_SECRET_KEY is set and correct: with REQUIRE_PRO on,"
      echo "an unset SUPABASE_URL or a missing or wrong secret refuses everyone."
    else
      echo "Enforcement is on; rerun with PRO_TOKEN=<a Pro account's access token>."
    fi
  fi
  exit 1
fi

payload=$(jwt_payload "$body")

if [ -z "$payload" ]; then
  echo "FAIL — could not decode the token payload; cannot tell which service"
  echo "issued it. Not treating this as a pass."
  exit 1
fi

# A real Deepgram grant carries the ASR scope. A Quran Foundation token never
# does — it carries an oauth2.quran.foundation issuer instead.
echo "payload: $payload"

case "$payload" in
  *quran.foundation*)
    echo
    echo "FAIL — /deepgram/token returned a Quran Foundation token."
    echo "The deployed Worker has no Deepgram route; it fell through to the"
    echo "default QF handler. Recite mode will fail against this deployment."
    echo
    echo "Fix:  cd token-broker && wrangler deploy"
    exit 1
    ;;
  *asr:write*)
    echo
    echo "PASS — Deepgram route is live and minting real ASR grants."
    ;;
  *)
    echo
    echo "FAIL — token is neither a Quran Foundation token nor a Deepgram ASR"
    echo "grant (no asr:write scope). Inspect the payload above."
    exit 1
    ;;
esac

# ── Soniox route ─────────────────────────────────────────────────────────
# Same trap as above: an undeployed route falls through to the default handler
# (a Quran Foundation token on 200, or a 404), so the route is checked by what
# it actually returns, not by HTTP status alone. The check reports and
# continues; the exit code is set at the end.
failed=0

echo
echo "── /soniox/token"
resp=$(curl -s -m 25 -w $'\n%{http_code}' -X POST -H "Origin: https://localhost" ${UH[@]+"${UH[@]}"} "$B/soniox/token")
code=${resp##*$'\n'}
body=${resp%$'\n'*}

if echo "$body" | grep -q '"access_token":"snx_temp_'; then
  echo "PASS — Soniox route is live and minting temporary keys."
elif [ "$code" = "503" ]; then
  echo "FAIL — SONIOX_API_KEY secret missing (503 STT not configured)."
  echo "Fix:  cd token-broker && wrangler secret put SONIOX_API_KEY"
  failed=1
elif [ "$code" = "404" ]; then
  echo "FAIL — Soniox route not deployed (HTTP 404)."
  echo "Fix:  cd token-broker && wrangler deploy"
  failed=1
elif echo "$body" | grep -q "access_token"; then
  # Only a Quran Foundation token means the request fell through to the
  # default handler; any other key is a format this script does not know.
  case "$(jwt_payload "$body")$body" in
    *quran.foundation*|*token_type*)
      echo "FAIL — /soniox/token returned a Quran Foundation token."
      echo "The deployed Worker has no Soniox route; it fell through to the"
      echo "default QF handler."
      echo "Fix:  cd token-broker && wrangler deploy"
      ;;
    *)
      echo "FAIL — unexpected key format from /soniox/token (HTTP $code; no snx_temp_ prefix):"
      echo "  $body"
      ;;
  esac
  failed=1
else
  echo "FAIL — unexpected response from /soniox/token (HTTP $code):"
  echo "  $body"
  failed=1
fi

exit "$failed"
