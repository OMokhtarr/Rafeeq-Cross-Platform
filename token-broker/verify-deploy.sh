#!/usr/bin/env bash
# Verifies the deployed broker actually serves the Deepgram route.
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

body=$(curl -s -m 25 -X POST -H "Origin: https://localhost" "$B/deepgram/token")

if ! echo "$body" | grep -q "access_token"; then
  echo "FAIL — no access_token in response:"
  echo "  $body"
  exit 1
fi

# Decode the JWT payload. Uses base64/sed rather than node: node is not always
# on PATH (notably when this runs from PowerShell), and a decoder that silently
# fails used to leave the issuer empty, which the check below read as a PASS.
b64=$(echo "$body" | sed 's/.*"access_token":"\([^"]*\)".*/\1/' | cut -d. -f2 | tr '_-' '/+')
case $(( ${#b64} % 4 )) in
  2) b64="$b64==" ;;
  3) b64="$b64=" ;;
esac
payload=$(echo "$b64" | base64 -d 2>/dev/null)

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
