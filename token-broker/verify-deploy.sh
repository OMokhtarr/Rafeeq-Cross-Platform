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

# ── Soniox + Whisper routes ──────────────────────────────────────────────────
# Same trap as above: an undeployed route falls through to the default handler
# (a Quran Foundation token on 200, or a 404), so each route is checked by what
# it actually returns, not by HTTP status alone. These two checks report and
# continue so one run shows every broken route; the exit code is set at the end.
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
elif [ "$code" = "404" ] || echo "$body" | grep -q "access_token"; then
  echo "FAIL — Soniox route not deployed (HTTP $code; got a non-Soniox response)."
  echo "Fix:  cd token-broker && wrangler deploy"
  failed=1
else
  echo "FAIL — unexpected response from /soniox/token (HTTP $code):"
  echo "  $body"
  failed=1
fi

echo
echo "── /whisper/transcribe"
# A 1-second silent 16 kHz mono 16-bit PCM WAV: a 44-byte header plus 32000
# zero bytes = 32044 bytes. Whisper may return an empty "text" for silence; the
# check is that the route answers with a "text" field, not what it heard.
wav=$(mktemp)
trap 'rm -f "$wav"' EXIT
printf 'RIFF\x24\x7d\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\x3e\x00\x00\x00\x7d\x00\x00\x02\x00\x10\x00data\x00\x7d\x00\x00' > "$wav"
head -c 32000 /dev/zero >> "$wav"

resp=$(curl -s -m 40 -w $'\n%{http_code}' -X POST -H "Origin: https://localhost" \
  -H "content-type: audio/wav" --data-binary @"$wav" "$B/whisper/transcribe")
code=${resp##*$'\n'}
body=${resp%$'\n'*}

if [ "$code" = "200" ] && echo "$body" | grep -q '"text"'; then
  echo "PASS — Whisper route is live and transcribing."
elif [ "$code" = "404" ]; then
  echo "FAIL — Whisper route not deployed (HTTP 404)."
  echo "Fix:  cd token-broker && wrangler deploy"
  failed=1
elif [ "${code:0:1}" = "5" ]; then
  wcode=$(echo "$body" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
  echo "FAIL — Whisper route returned HTTP $code (code: ${wcode:-none})."
  echo "  $body"
  failed=1
else
  echo "FAIL — unexpected response from /whisper/transcribe (HTTP $code):"
  echo "  $body"
  failed=1
fi

exit "$failed"
