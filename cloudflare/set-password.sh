#!/bin/bash
# Sets the household password in D1, asking for it twice without echo. Nothing is
# generated: the password is yours. It is hashed inside the tooling image (PBKDF2, the
# Worker's 100,000 iterations) and only the hash is written to D1.
#
#   ./set-password.sh --remote                      production D1
#   ./set-password.sh --local                       wrangler dev's local D1
#   ./set-password.sh --remote --end-sessions       also log every device out
#   ./set-password.sh --local --profiles=Alice,Bob  first run on an empty database:
#                                                   creates the household and profiles
#
# Run it once after migrate-data.sh: the imported hash has 210,000 iterations, which the
# Deno server accepts and a Worker refuses, so until then nobody can log in.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

where=""
end_sessions=0
profiles=""
for a in "$@"; do
  case "$a" in
    --remote | --local) where="$a" ;;
    --end-sessions) end_sessions=1 ;;
    --profiles=*) profiles="${a#--profiles=}" ;;
    *) echo "unknown argument: $a" >&2; exit 1 ;;
  esac
done
[[ -n "$where" ]] || { echo "say --remote or --local" >&2; exit 1; }

households=$(./wr d1 execute DB "$where" --json --command 'SELECT COUNT(*) AS n FROM households' </dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["results"][0]["n"])')

if [[ "$households" == "0" && -z "$profiles" ]]; then
  echo "no household in this database yet: pass --profiles=<A>,<B> to create it" >&2
  exit 1
fi

read -rsp 'New household password: ' pw1; echo
read -rsp 'Again: ' pw2; echo
[[ "$pw1" == "$pw2" ]] || { echo "they differ, nothing changed" >&2; exit 1; }
[[ ${#pw1} -ge 8 ]] || { echo "shorter than 8 characters, nothing changed" >&2; exit 1; }

hash=$(printf '%s' "$pw1" | WR_STDIN=1 ./wr exec deno eval --quiet "
  import { hashPassword } from '/work/api/auth/password.ts';
  const pw = await new Response(Deno.stdin.readable).text();
  console.log(await hashPassword(pw));
")
unset pw1 pw2
[[ "$hash" == pbkdf2\$100000\$* ]] || { echo "hashing failed, nothing changed" >&2; exit 1; }

# The SQL goes through a file, so the hash never appears in a process list. export/ is
# gitignored; the file is 0600 and removed on exit.
mkdir -p export
sql=export/set-password.sql
umask 077
trap 'rm -f "$HERE/$sql"' EXIT

python3 - "$hash" "$profiles" "$households" > "$sql" <<'PY'
import sys, uuid, datetime
pw_hash, profiles, households = sys.argv[1], sys.argv[2], sys.argv[3]
q = lambda s: "'" + s.replace("'", "''") + "'"
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
if households == '0':
    hid = str(uuid.uuid4())
    print(f"INSERT INTO households (id, name, password_hash, timezone, created_at) "
          f"VALUES ({q(hid)}, 'Home', {q(pw_hash)}, 'Asia/Tokyo', {q(now)});")
    for name in [p.strip() for p in profiles.split(',') if p.strip()]:
        print(f"INSERT INTO profiles (id, household_id, name, created_at) "
              f"VALUES ({q(str(uuid.uuid4()))}, {q(hid)}, {q(name)}, {q(now)});")
else:
    print(f"UPDATE households SET password_hash = {q(pw_hash)};")
PY
if [[ $end_sessions -eq 1 ]]; then
  echo "DELETE FROM sessions;" >> "$sql"
fi

./wr d1 execute DB "$where" --file "$sql" </dev/null >/dev/null
if [[ $end_sessions -eq 1 ]]; then echo "password set, every session ended"; else echo "password set"; fi
