#!/usr/bin/env bash
# Deletes a Rafeeq account for a support request, through the same
# delete-account edge function the app uses (Apple revoke, RevenueCat, then
# the auth user).
#
#   SUPABASE_URL=https://<ref>.supabase.co ADMIN_DELETE_SECRET=... \
#     scripts/delete-account.sh <user-id | email>
#
# Prints the HTTP status and the response body; exits non-zero unless 2xx.
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <user-id | email>" >&2
  exit 2
fi
: "${SUPABASE_URL:?SUPABASE_URL is not set}"
: "${ADMIN_DELETE_SECRET:?ADMIN_DELETE_SECRET is not set}"

target="$1"
if [[ "$target" =~ ^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$ ]]; then
  body="{\"id\":\"$target\"}"
elif [[ "$target" =~ ^[^\"\\[:space:]]+@[^\"\\[:space:]]+$ ]]; then
  body="{\"email\":\"$target\"}"
else
  echo "not a user id or an email: $target" >&2
  exit 2
fi

response="$(curl -sS -w $'\n%{http_code}' -X POST \
  -H "content-type: application/json" \
  -H "x-admin-secret: $ADMIN_DELETE_SECRET" \
  --data "$body" \
  "${SUPABASE_URL%/}/functions/v1/delete-account")"

status="${response##*$'\n'}"
echo "HTTP $status"
echo "${response%$'\n'*}"
[[ "$status" =~ ^2[0-9][0-9]$ ]]
