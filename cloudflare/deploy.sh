#!/bin/bash
# Deploys the Worker from the committed working tree: client bundle, type-check, pending
# D1 migrations, wrangler deploy, then a health check through the public hostname.
#
#   ./deploy.sh            refuses a dirty tree: the bundle is tagged with the commit
#   ./deploy.sh --dirty    deploy anyway (the tag then names a commit the code is not)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

[[ -f .env ]] || { echo "no cloudflare/.env - see .env.example" >&2; exit 1; }
. ./.env
URL=${PUBLIC_URL:-https://$HOSTNAME}

if [[ "${1:-}" != --dirty && -n "$(git status --porcelain -- ..)" ]]; then
  echo "uncommitted changes; commit first or pass --dirty" >&2
  exit 1
fi

echo "== client bundle"
./wr build-client
echo "== type-check"
./wr check
echo "== D1 migrations"
./wr d1 migrations apply DB --remote </dev/null
echo "== deploy"
./wr deploy </dev/null

echo "== health"
for _ in 1 2 3 4 5 6; do
  if curl -fsS --max-time 10 "$URL/api/health" | grep -q '"ok":true'; then
    echo "$URL answers"
    exit 0
  fi
  sleep 5
done
echo "$URL/api/health is not answering ok" >&2
exit 1
