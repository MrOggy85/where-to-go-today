# CLAUDE.md

[PROJECT.md](PROJECT.md) is the design contract. Read it before adding a feature, and
update it in the same change when a new requirement conflicts with it.

## Rules that are easy to break

- The api runs on two runtimes from one codebase: Deno (`api/main.ts`, SQLite, disk) and a
  Cloudflare Worker (`cloudflare/src/index.ts`, D1, R2). Shared code (`api/app.ts`, routes,
  `api/db/*` except `sqlite.ts`, `api/auth/*` except `geo.ts`) must not touch `Deno.*`,
  `jsr:` imports or Worker bindings; runtime specifics go in an adapter. `cloudflare/wr check`
  is what proves it.
- All SQL lives in `api/db/`, through `rows`/`row`/`run`/`batch` in `api/db/db.ts`. Route
  handlers call functions there, never a driver. Writes that belong together go in one
  `batch` (a D1 batch is a transaction); there is no `BEGIN`.
- A schema change is a new file in `cloudflare/migrations/` **and** the matching change in
  `api/db/schema.sql`/`migrate.ts`.
- Every query filters on `household_id`. Never trust an id from the client to scope data.
- Recommendation weights belong in `api/recommendations/config.ts`, not in `engine.ts`.
- Missing place metadata means "unknown", never "exclude". Eligibility filters stay
  conservative.
- Places with visit history are archived, not deleted.
- Photo bytes live behind `api/photos/storage.ts` (`<data dir>/photos/` on Deno, the
  private R2 bucket on the Worker) and are served **only** by `GET /api/photos/:id/file`,
  which scopes on `household_id` first. Never as static files.
- Deleting photo rows must unlink the files too, including when they vanish by cascade from
  a deleted place. An orphaned row breaks the grid; an orphaned file never gets collected.
- Images are resized in the browser (`client/src/photos.ts`), never on the server. The api
  owns no image decoder and must not grow one.
- List rows preview photos from `photoIds` on the place payload. Never fetch photos per row.
- Never log session cookies, passwords, password hashes, note contents or home
  coordinates.
- No new runtime dependencies without a real need. No ORM, router, state library or UI
  framework.

## Design system

- Every colour, size, radius, shadow and duration comes from `client/src/tokens.css`.
  Components must not hardcode them.
- Shared surfaces, buttons and form controls live in `client/src/ui.module.css`. Page
  stylesheets compose from it.
- **A page class must never override a property its composed base already sets.** esbuild
  cannot order declarations composed across files and warns
  `undefined-composes-from`. Add the variant to `ui.module.css` instead, where same-file
  composition is deterministic.
- Icons are inline SVG in `client/src/icons.tsx` on a 24px grid, 1.75 stroke,
  `currentColor`. No icon font, no sprite sheet.
- No `window.confirm` or `alert`; use `components/Sheet.tsx`. No bare `Loading…`; use
  `components/Skeleton.tsx`.
- Interactive targets are at least `--tap` (44px). Where a control has to look smaller than
  that — a filter chip, a corner badge — grow the target past the paint with a
  `position: absolute` `::after` rather than inflating the control. Check the overhang stays
  inside the neighbouring gap. Layouts are checked at 390x844 (iPhone 14).
- Animation goes through `--dur`/`--ease` so `prefers-reduced-motion` disables it in one
  place.
- An unset place attribute renders nothing at all. "Unknown" is not "no".

## Conventions

- Deno + `Deno.serve` or a Cloudflare Worker for the api, React + CSS Modules + esbuild for the client.
- `jsr:`/`npm:` specifiers inline; no import map.
- Single quotes, semicolons, 120 columns. Run `make fmt`.
- Route handlers return `jsonResponse` / `errorResponse` from `api/db/validate.ts`.
- Client state is `useState` plus `fetch`; routing is the hash, via `useHashRoute.ts`.

## Verifying a change

```sh
make check
make dev       # then exercise the loop over http://localhost:8777
make cf-check  # the Worker build type-checks (shared code stays runtime-free)
make cf-dev    # the Worker locally on http://127.0.0.1:8787, local D1 and R2
```

`scripts/seed.ts --demo` gives enough places for the Today page to be meaningful.

## Deployment

**Moving to Cloudflare Workers** (prepared 2026-11-16, branch `cloudflare`): D1 + R2 +
static assets on a Custom Domain, so the home server leaves the request path.
`cloudflare/README.md` has the setup, the differences from the Deno server and why. Until
the cutover, the Deno deployment below is production.

Production runs on the home server as two Docker containers on the **rootless** daemon
(since 2026-11-11; every deploy script sets `DOCKER_CONTEXT=rootless`), public over
Tailscale Funnel. `deploy/` holds the scripts; `PROJECT.md` section 21 is the contract.

```txt
Internet -> Tailscale Funnel -> wtgt-tailscale  -> where-to-go-today
                                (TLS, own node)    (--network=container:, shared loopback)
```

- **Production admits Japan and the tailnet only** (`GEO_ALLOW_COUNTRIES=JP` in `deploy/start.sh`,
  `api/auth/geo.ts`). Anywhere else the whole app answers `403`, so abroad it is used over Tailscale. The list
  is `data/geo-allow.json`, refetched by the app when older than 7 days; a failed refetch keeps the old list.
  It fails closed — no list means tailnet only — and depends on `TRUST_PROXY=1`, without which every client
  looks like loopback and is admitted.
- **The app's network is confined, because the sidecar is a tailnet node.** Sharing its namespace
  used to mean a compromised app could open connections to every tailnet device, the host's ports
  and the LAN (measured 2026-11-05: all open). `deploy/egress-firewall.sh` is the sidecar's
  entrypoint and limits uid 1000 to DNS and public HTTPS before tailscaled starts, on every
  restart; tailscaled (root) is untouched. If you add an outbound dependency to the api, it has
  to fit that, or the rule has to change on purpose. The app container is also read-only,
  capability-free, `no-new-privileges`, and bounded in processes and memory; only `data/` is
  writable.
- **Logs are files too:** `LOG_DIR=/app/data/logs`, one `app-YYYY-MM-DD.jsonl` per UTC day, 90 days.
  The home server's access watcher reads them every 2 minutes and alerts on outside logins, sessions
  on new networks and password guessing, so keep the `message`, `ip` and `sid` fields stable — renaming
  `login succeeded` silently blinds it. Never log the session token itself; `sid` is its one-way tag.
- **Changing the password does not end sessions** (`seed.ts --force` rewrites only the hash). After a
  suspected compromise, delete every `sessions` row as well as resetting the password.
- Start order is **sidecar, then app** — the app joins the sidecar's network namespace and
  cannot start before it exists. `make deploy-up` does both.
- Recreating the sidecar destroys that namespace, so the app must be recreated too.
- **Rootless, and what that changes** (2026-11-11). Kernel-mode Tailscale (`TS_USERSPACE=false`)
  and the egress firewall both work unchanged: the sidecar gets `--device /dev/net/tun` and
  drops every capability but `NET_ADMIN`, `NET_RAW` and `NET_BIND_SERVICE`. Its root is the
  host user, so `tailscale_state/` stays user-owned without a chown. The app runs as
  `-u 1000:0`: uid 1000 is still what the firewall confines, and gid 0 is the one container
  gid that maps to the host user, so `deploy/data/` is `<subuid>:<user>`, dirs 2775, and the
  host's log readers still read it. Fix ownership through a container as root
  (`chown -R 1000:0`), never on the host.
- **The image is pinned by ID.** `deploy/build.sh` tags `where-to-go-today:<commit>` and writes
  the image ID to `deploy/.image` (untracked); `deploy/start.sh` runs that ID and refuses
  without it. No `:latest` — this is the one public service.
- The api listens on `127.0.0.1` only. It is never published to a host port; the sidecar
  is the only way in.
- `TRUST_PROXY=1` is required in production and set in `deploy/start.sh`. Behind the
  sidecar every request arrives over loopback, so without it the whole internet shares
  one login-throttle bucket. Never set it when the api is reachable directly.
- `serve.json` is **generated** by `sidecar.sh` from `serve.json.template`, substituting
  `__PUBLIC_HOSTNAME__` from `TS_HOSTNAME`/`TS_TAILNET` in `deploy/.env`. Edit the
  template, never the output. Its `TCP` block is not optional — without it port 443 never
  binds and Funnel fails *silently*. `AllowFunnel` is top-level, not nested inside `Web`.
- `deploy/seed.sh` creates the household in the production volume. Until it runs, login
  has nothing to check against.
- Photos are written to `/app/data/photos/`, inside the existing `deploy/data` bind mount,
  so the one volume and one backup already cover both them and the database. No extra mount
  and no `--allow-write` change; `/app/data` already grants the subdirectory.

### Secrets

This is a public repo, and PROJECT.md section 17 requires it to contain no production secrets. 
Untracked: `deploy/.env` (auth key, tailnet name), `deploy/serve.json` (generated, contains the hostname) and `deploy/tailscale_state/`
(node private key, TLS keys). If a deployment needs to be recovered, the node
re-authenticates from a fresh key rather than from git.

The tailnet name counts as a secret, not just the keys: it is the DNS suffix shared by
every other service on the same tailnet, so publishing it turns a private hostname into a
probe list. Keep it out of docs, commit messages and issues — write
`<app>.<tailnet>.ts.net` instead.

### Resetting the password

`deploy/seed.sh --password=... --force` rewrites the hash, and nothing else:

- **Pass the real profile names**, `--profiles=<A>,<B>`. Without it seed adds two more
  profiles named `Adult 1` and `Adult 2` next to the existing ones.
- **Sessions survive it.** Every logged-in device stays logged in, including a stolen one.
  After a suspected compromise, also delete every row in `sessions`.

### Funnel and the client IP

Measured 2026-11-05: Funnel puts the real client address in `X-Forwarded-For` and
**replaces** any value the client sent, so `TRUST_PROXY=1` cannot be spoofed through it.
Re-measure if the ingress ever changes: the throttles and the country filter all trust
the first entry of that header.

### Node key expiry

Generate auth keys **Reusable: ON, Ephemeral: OFF**, then set *Disable key expiry* on the
node in the admin console. Without that last step the node key expires (~180 days), the
sidecar fails to start with `server reports new node key ... has expired`, and the app goes
down with it because it shares the namespace. That is an expired-credential problem — not a
`serve.json` or app misconfiguration.
