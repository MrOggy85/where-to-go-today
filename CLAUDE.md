# CLAUDE.md

[PROJECT.md](PROJECT.md) is the design contract. Read it before adding a feature, and
update it in the same change when a new requirement conflicts with it.

## Rules that are easy to break

- All SQL lives in `api/db/`. Route handlers call functions there, never `db.prepare`.
- Every query filters on `household_id`. Never trust an id from the client to scope data.
- Recommendation weights belong in `api/recommendations/config.ts`, not in `engine.ts`.
- Missing place metadata means "unknown", never "exclude". Eligibility filters stay
  conservative.
- Places with visit history are archived, not deleted.
- Photo bytes live in `<data dir>/photos/` and are served **only** by
  `GET /api/photos/:id/file`, which scopes on `household_id` first. Never as static files.
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
- Interactive targets are at least `--tap` (44px). Animation goes through `--dur`/`--ease`
  so `prefers-reduced-motion` disables it in one place.
- An unset place attribute renders nothing at all. "Unknown" is not "no".

## Conventions

- Deno + `Deno.serve` for the api, React + CSS Modules + esbuild for the client.
- `jsr:`/`npm:` specifiers inline; no import map.
- Single quotes, semicolons, 120 columns. Run `make fmt`.
- Route handlers return `jsonResponse` / `errorResponse` from `api/db/validate.ts`.
- Client state is `useState` plus `fetch`; routing is the hash, via `useHashRoute.ts`.

## Verifying a change

```sh
make check
make dev   # then exercise the loop over http://localhost:8777
```

`scripts/seed.ts --demo` gives enough places for the Today page to be meaningful.

## Deployment

Production runs on the home server as two Docker containers, public over
Tailscale Funnel. `deploy/` holds the scripts; `PROJECT.md` section 21 is the contract.

```txt
Internet -> Tailscale Funnel -> wtgt-tailscale  -> where-to-go-today
                                (TLS, own node)    (--network=container:, shared loopback)
```

- Start order is **sidecar, then app** — the app joins the sidecar's network namespace and
  cannot start before it exists. `make deploy-up` does both.
- Recreating the sidecar destroys that namespace, so the app must be recreated too.
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

### Node key expiry

Generate auth keys **Reusable: ON, Ephemeral: OFF**, then set *Disable key expiry* on the
node in the admin console. Without that last step the node key expires (~180 days), the
sidecar fails to start with `server reports new node key ... has expired`, and the app goes
down with it because it shares the namespace. That is an expired-credential problem — not a
`serve.json` or app misconfiguration.
