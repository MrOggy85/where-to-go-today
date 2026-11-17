#!/bin/bash
# Copies the household's data from the Deno server's volume (deploy/data) into D1.
#
#   ./migrate-data.sh --local     into wrangler dev's local D1, to rehearse (./wr dev running)
#   ./migrate-data.sh --remote    into production (Worker deployed). Refuses if D1 already
#                                 holds a household.
#
# Rows go in as one SQL file. Photos cannot: D1 caps one SQL statement at about 100 KB and
# a photo is 0.5-0.9 MB, so each is PUT to the Worker's /api/ops/photo with OPS_TOKEN and
# stored by the app's own photo store.
#
# Read-only on the source: the database is copied with SQLite's backup API (never a file
# copy: it runs with a WAL), the photos through a throwaway container, because they are
# 0620 files owned by the app container's uid. Everything lands in export/ (gitignored,
# family data) and stays there until you remove it.
#
# Afterwards: ./set-password.sh <same flag>. The imported hash has 210,000 PBKDF2
# iterations, which a Worker refuses, so nobody can log in until it is rehashed.
set -euo pipefail
export DOCKER_CONTEXT=rootless
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$HERE")
cd "$HERE"

where="${1:-}"
[[ "$where" == --local || "$where" == --remote ]] || { sed -n '2,10p' "$0"; exit 1; }

DATA=${WTGT_DATA:-$REPO/deploy/data}
[[ -f .env ]] && . ./.env
if [[ "$where" == --local ]]; then
  BASE=http://127.0.0.1:8787
  OPS_TOKEN=$(sed -n 's/^OPS_TOKEN=//p' .dev.vars 2>/dev/null)
else
  BASE=${PUBLIC_URL:-https://$HOSTNAME}
  OPS_TOKEN=$(cat "$HOME/.config/where-to-go-today/ops-token" 2>/dev/null)
fi
[[ -n "${OPS_TOKEN:-}" ]] || { echo "no OPS_TOKEN (.dev.vars locally, ~/.config/where-to-go-today/ops-token remotely)" >&2; exit 1; }
curl -fsS --max-time 10 "$BASE/api/health" >/dev/null || { echo "the Worker does not answer at $BASE" >&2; exit 1; }

[[ -f "$DATA/app.sqlite3" ]] || { echo "no database at $DATA/app.sqlite3" >&2; exit 1; }

umask 077
mkdir -p export/photos

echo "1/5 snapshot of $DATA/app.sqlite3"
python3 - "$DATA/app.sqlite3" export/snapshot.sqlite3 <<'PY'
import sqlite3, sys
src = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()
PY

echo "2/5 data as SQL"
counts=$(python3 export-sqlite.py export/snapshot.sqlite3 export/data.sql)
echo "    $counts"

echo "3/5 photos out of the volume"
# uid 1000 inside the rootless container is the uid that owns the files on the host.
docker run --rm -u 1000 --network none --cap-drop ALL --security-opt no-new-privileges \
  -v "$DATA/photos":/photos:ro denoland/deno:2.6.9 sh -c 'cd /photos && tar -cf - .' |
  tar -C export/photos -xf -
photo_files=$(find export/photos -type f | wc -l)
echo "    $photo_files files"

echo "4/5 schema and rows into D1 ($where)"
existing=$(./wr d1 execute DB "$where" --json --command \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'households'" </dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["results"][0]["n"])')
if [[ "$existing" == "1" ]]; then
  households=$(./wr d1 execute DB "$where" --json --command 'SELECT COUNT(*) AS n FROM households' </dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["results"][0]["n"])')
  if [[ "$households" != "0" ]]; then
    echo "D1 already holds a household; refusing to import on top of it" >&2
    exit 1
  fi
fi
./wr d1 migrations apply DB "$where" </dev/null
./wr d1 execute DB "$where" --file export/data.sql </dev/null >/dev/null

echo "5/5 photos into D1 through $BASE/api/ops/photo"
for f in export/photos/*; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f")
  case "$name" in
    *.jpg) type=image/jpeg ;; *.png) type=image/png ;; *.webp) type=image/webp ;; *) type=application/octet-stream ;;
  esac
  # The token goes to curl on stdin, never on the command line.
  printf 'header = "Authorization: Bearer %s"\n' "$OPS_TOKEN" |
    curl -fsS --max-time 60 -K - -X PUT -H "content-type: $type" --data-binary "@$f" \
      "$BASE/api/ops/photo?name=$name" >/dev/null
  echo "    $name"
done

echo "check: rows in D1"
./wr d1 execute DB "$where" --json --command "
  SELECT (SELECT COUNT(*) FROM households) households, (SELECT COUNT(*) FROM profiles) profiles,
         (SELECT COUNT(*) FROM categories) categories, (SELECT COUNT(*) FROM places) places,
         (SELECT COUNT(*) FROM place_categories) place_categories, (SELECT COUNT(*) FROM visits) visits,
         (SELECT COUNT(*) FROM photos) photos, (SELECT COUNT(*) FROM photo_bytes) photo_bytes" </dev/null |
  python3 -c '
import json, sys
got = json.load(sys.stdin)[0]["results"][0]
want = json.loads(sys.argv[1])
want["photo_bytes"] = want["photos"]
bad = {k: (want[k], got[k]) for k in want if want[k] != got[k]}
print("    D1:", got)
if bad:
    sys.exit(f"MISMATCH (source, D1): {bad}")
print("    every table matches the source")
' "$counts"

echo "done. Next: ./set-password.sh $where"
