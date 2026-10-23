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

set -uo pipefail
B="${BROKER_URL:-https://rafeeq-token-broker.rafeeqapp.workers.dev}"

echo "broker: $B"

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

body=$(curl -s -m 25 -X POST -H "Origin: https://localhost" "$B/deepgram/token")

if ! echo "$body" | grep -q "access_token"; then
  echo "FAIL — no access_token in response:"
  echo "  $body"
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
resp=$(curl -s -m 25 -w $'\n%{http_code}' -X POST -H "Origin: https://localhost" "$B/soniox/token")
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
