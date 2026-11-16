# Cloudflare Workers deployment

The same app as the Deno server, run as a Cloudflare Worker: **D1** for the database,
**R2** for photo bytes, the client bundle as **Workers static assets**, on a Custom Domain.
No home server in the request path.

```txt
Internet -> Cloudflare edge (TLS) -> Worker (country filter, throttle, api/app.ts)
                                       -> D1  (households ... photos, login_attempts, log_lines)
                                       -> R2  (photos/<uuid>.jpg, private bucket)
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
| `./wr dev` | the Worker on `http://127.0.0.1:8787` with local D1/R2 under `.wrangler/state` |
| `./wr <wrangler args>` | wrangler itself, e.g. `./wr d1 execute DB --remote --command '…'` |
| `./deploy.sh` | bundle, check, migrations, deploy, health check |
| `./migrate-data.sh --local\|--remote` | copy `deploy/data` (SQLite + photos) into D1/R2 |
| `./set-password.sh --local\|--remote` | set the household password (asked twice, no echo) |

`wrangler.jsonc` is **generated** from `wrangler.template.jsonc` and `.env` on every `./wr`
run. Edit the template. `.env` (account id, D1 id, bucket, hostname) and the API token
stay out of git: this is a public repo.

`./wr dev` reads `.dev.vars` (untracked) for local values such as `OPS_TOKEN=…` or
`GEO_ALLOW_COUNTRIES=SE` to see the refusal.

## First deployment

1. API token (dashboard → My Profile → API Tokens): start from *Edit Cloudflare Workers*,
   add **D1: Edit**, limit it to the one account and the one zone. Save it as
   `CLOUDFLARE_API_TOKEN=…` in the file `TOKEN_FILE` names (0600, outside the repo).
2. `cp .env.example .env`, fill in `CF_ACCOUNT_ID` and `HOSTNAME`.
3. `./wr d1 create where-to-go-today --location apac`, put the id in `.env` as `D1_ID`.
4. `./wr r2 bucket create where-to-go-today-photos --location apac`. Leave public access off.
5. `./wr secret put OPS_TOKEN`: a long random string, also given to the home server's watcher.
6. `./migrate-data.sh --remote`, then `./set-password.sh --remote`.
7. `./deploy.sh`.

## Things that differ from the Deno server, and why

- **Password hashes: 100,000 PBKDF2 iterations, not 210,000.** Workers refuses more than
  100,000 (workerd issue 1346; the local `wrangler dev` runtime does not enforce it, so a
  local test passes where production would not). A hash carries its own count, so the
  Deno server still verifies the old ones; on a Worker the old hash fails with
  `password check failed, reset the password to rehash it` in the log. One check costs
  about 20 ms of CPU (measured on the home server). **The Workers Free plan allows 10 ms
  per request**, so logins need the Paid plan or fewer iterations.
- **Country filter: Cloudflare's `request.cf.country`**, not the APNIC + iCloud Private
  Relay list. Same variable, `GEO_ALLOW_COUNTRIES=JP`, same place in the code (before
  anything, static files included), same fail-closed rule (no country, no entry). There
  is **no tailnet exception**: abroad, add the country to `vars` in the template and
  redeploy, or the whole app answers 403. Check on the iPhone with iCloud Private Relay
  on that it still gets in.
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
