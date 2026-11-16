# Cloudflare Workers deployment

The same app as the Deno server, run as a Cloudflare Worker: **D1** for the database
and the photo bytes, the client bundle as **Workers static assets**, on a Route under the
zone's wildcard certificate.
No home server in the request path.

```txt
Internet -> Cloudflare edge (TLS, the zone's wildcard certificate) -> Worker (throttle, api/app.ts)
                                       -> D1  (households ... photos, photo_bytes, login_attempts, log_lines)
                                       -> static assets (api/client)
```

The application code is shared with the Deno server: `api/app.ts` is the handler, and each
runtime plugs in its storage (`api/db/db.ts`, `api/photos/storage.ts`, `api/logger.ts`).
`src/` holds only the Worker's adapters and entry point.

## Tooling

Everything runs in an image built from `Dockerfile` (wrangler, deno, tsc), through `./wr`.
Nothing is installed on the host.

| Command | Does |
|---|---|
| `./wr check` | type-check the Worker and the shared code it bundles |
| `./wr build-client` | build `api/client` |
| `./wr dev` | the Worker on `http://127.0.0.1:8787` with a local D1 under `.wrangler/state` |
| `./wr <wrangler args>` | wrangler itself, e.g. `./wr d1 execute DB --remote --command '…'` |
| `./deploy.sh` | bundle, check, migrations, deploy, health check |
| `./migrate-data.sh --local\|--remote` | copy `deploy/data` (SQLite + photos) into D1 |
| `./set-password.sh --local\|--remote` | set the household password (asked twice, no echo) |
| `./set-token.sh` | store the Cloudflare API token (no echo, checked, 0600 outside the repo) |

`wrangler.jsonc` is **generated** from `wrangler.template.jsonc` and `.env` on every `./wr`
run. Edit the template. `.env` (account id, D1 id, bucket, hostname) and the API token
stay out of git: this is a public repo.

`./wr dev` reads `.dev.vars` (untracked) for local values such as `OPS_TOKEN=…` or
`GEO_ALLOW_COUNTRIES=SE` to see the refusal.

## First deployment

1. **Dashboard, once** (so the token never needs to create or delete anything):
   - Workers & Pages → Create → a Hello World Worker named **`where-to-go-today`**. The
     first `./deploy.sh` replaces it and turns its `workers.dev` address off.
   - Storage & Databases → D1 → Create **`where-to-go-today`**, location Asia-Pacific.
     Its id goes in `.env` as `D1_ID`.
   - DNS → `AAAA <name> 100::`, **Proxied**. Only there so the edge answers for the name;
     the Route in `wrangler.jsonc` sends its requests to the Worker. Not a Custom Domain:
     that issues a certificate for the one hostname, which publishes it in CT.
2. `cp .env.example .env`, fill in `CF_ACCOUNT_ID`, `HOSTNAME`, `ZONE_NAME`, `D1_ID`.
   The hostname is **one level below the zone** (`<name>.<zone>`), so the zone's
   Universal SSL wildcard covers it.
3. API token (below), stored with `./set-token.sh`.
4. `./wr secret put OPS_TOKEN`: a long random string, also given to the home server's watcher.
5. `./migrate-data.sh --remote`, then `./set-password.sh --remote`.
6. `./deploy.sh`.

## API token

An **account-owned** token (Manage Account → Account API Tokens → Create): wrangler's
`wrangler login` does not support the per-Worker roles Cloudflare introduced in
2026-09, and the old *Workers Scripts* permissions are marked Legacy. Policies:

| Product / zone | Role or permission | Scope | For |
|---|---|---|---|
| Workers | **Editor** | the Worker `where-to-go-today` | deploy, `secret put`, `./wr tail`, logs and CPU time (Editor includes Metadata Read-only) |
| D1 | **Editor** (or *D1: Edit* if that row is still the old kind) | the database `where-to-go-today` | migrations, the import, `set-password.sh` |
| Zone `okuno.se` | **Workers Routes: Edit** | that zone only | the Route on the hostname |
| Zone `okuno.se` | **Zone: Read** | that zone only | wrangler turns `zone_name` into the zone id |

No Admin: Editor cannot create or delete, which is why the Worker and the database are
made in the dashboard first. No R2: photos live in D1 (below). If scoping to the one Worker is refused (there are
reports of that), scope Workers Editor to all Workers instead. **No DNS permission**:
whoever can edit the zone's records can redirect its mail, so each app's one proxied
record is added by hand. Roles: developers.cloudflare.com/workers/authorization/.

## Things that differ from the Deno server, and why

- **Password hashes: 100,000 PBKDF2 iterations, not 210,000.** Workers refuses more than
  100,000 (workerd issue 1346; the local `wrangler dev` runtime does not enforce it, so a
  local test passes where production would not). A hash carries its own count, so the
  Deno server still verifies the old ones; on a Worker the old hash fails with
  `password check failed, reset the password to rehash it` in the log. The hashing is
  native WebCrypto (`crypto.subtle.deriveBits`), not a JS library. One check costs about
  20 ms of CPU on the home server's N100; Cloudflare's CPUs are faster, and **the Free
  plan allows 10 ms per request**. After the first deploy, read the login requests' CPU
  time in the dashboard (Workers → where-to-go-today → Observability, `$workers.cpuTimeMs`)
  or `./wr tail`. If logins fail with error 1102 or sit near the limit, lower
  `PBKDF2_ITERATIONS` in the template, redeploy, and run `./set-password.sh --remote`:
  existing hashes keep their own count until rehashed.
- **No country filter by default** (`GEO_ALLOW_COUNTRIES` empty, chosen 2026-11-16): on
  Cloudflare there is no tailnet way in, so the filter would lock the family out abroad.
  The password, the login throttle and the access watcher (which alerts on every login)
  are the fence. Setting it (`JP`, `JP,SE`) turns on the same check as before, with
  Cloudflare's `request.cf.country` in place of the APNIC + iCloud Private Relay list,
  still before anything (static files included) and still failing closed.
- **Photos live in D1, not on disk** (`photo_bytes`, `src/d1photos.ts`; decided
  2026-11-16 over R2). The app shrinks each photo to 1600 px JPEG before upload
  (0.5–0.9 MB) and D1 stores at most 2 MB per value, so the Worker caps one photo at
  1.9 MB (the Deno server allows 6 MB). It needs no second service, and D1 Time Travel
  (7 days on Free) restores photos with everything else, which R2 could not. Free D1
  holds 500 MB per database: roughly 600 photos. `migrate-data.sh` cannot put them in
  its SQL file (D1 caps one statement at about 100 KB), so it PUTs each to
  `/api/ops/photo` with `OPS_TOKEN`, which stores only bytes for a `photos` row that
  already exists.
- **Request throttle: the Rate Limiting binding**, 600 a minute per address. It counts
  per Cloudflare location and approximately, which is fine for a ceiling against
  scanners. **The login throttle is strict** and counts in D1 (`login_attempts`), one
  atomic statement per attempt, 10 per 15 minutes as before.
- **Client address: `CF-Connecting-IP`**, set by the edge. No `TRUST_PROXY`.
- **Logs**: every line goes to Workers Logs (`observability` on) and, for the home
  server's access watcher, to D1's `log_lines`: the same JSON as the `app-*.jsonl` files,
  90 days, pruned by the 03:17 JST cron. The watcher reads them from
  `GET /api/ops/log?after=<id>` with `Authorization: Bearer <OPS_TOKEN>`; without the
  secret set that route does not exist. Keep `message`, `ip` and `sid` stable.
- **Schema in two places.** D1 uses `migrations/`; the Deno server uses
  `api/db/schema.sql` + `api/db/migrate.ts`. A schema change is a new numbered migration
  here **and** the matching change there. `migrate-data.sh` refuses an export whose
  columns D1 does not have.
- **Housekeeping is a cron**, not timers: expired sessions, stale login counters, old log
  lines (`scheduled` in `src/index.ts`; locally `curl 127.0.0.1:8787/cdn-cgi/local/scheduled`).
- **One way in.** `workers_dev` and `preview_urls` are off, so the Worker answers only on
  the Custom Domain.
