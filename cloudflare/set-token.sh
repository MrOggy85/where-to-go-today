#!/bin/bash
# Stores the Cloudflare API token wrangler uses, asking for it without echo, in the file
# TOKEN_FILE names (cloudflare/.env; default ~/.config/where-to-go-today/cloudflare.env),
# 0600, outside the repo. Checks it with Cloudflare before saving; prints nothing of it.
#
#   ./set-token.sh
#
# The permissions it needs are in README.md, "API token".
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

TOKEN_FILE="$HOME/.config/where-to-go-today/cloudflare.env"
# shellcheck disable=SC1091
[[ -f "$HERE/.env" ]] && . "$HERE/.env"

read -rsp 'Cloudflare API token: ' token; echo
[[ -n "$token" ]] || { echo "empty, nothing changed" >&2; exit 1; }

# The token goes to curl on stdin (a config line), never on the command line.
status=$(printf 'header = "Authorization: Bearer %s"\n' "$token" |
  curl -sS --max-time 20 -K - https://api.cloudflare.com/client/v4/user/tokens/verify |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("status","invalid") if d.get("success") else "invalid")')
[[ "$status" == active ]] || { echo "Cloudflare says the token is $status, nothing changed" >&2; exit 1; }

umask 077
mkdir -p "$(dirname "$TOKEN_FILE")"
printf 'CLOUDFLARE_API_TOKEN=%s\n' "$token" > "$TOKEN_FILE.tmp"
mv "$TOKEN_FILE.tmp" "$TOKEN_FILE"
unset token
echo "saved to $TOKEN_FILE (0600), token is active"
