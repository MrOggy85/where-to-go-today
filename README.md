# What Should We Do Today?

A private family web app that answers one recurring question: what should we do today?

It keeps a curated database of places the family might visit, records when we went, and
turns that into a short, explainable list of good choices for today.

See [PROJECT.md](PROJECT.md) for the product and technical design contract. Read it before
adding features.

## Status

MVP (PROJECT.md phase 1, minus photos and the diary feed):

- shared household login, server-side sessions, two selectable adult profiles
- place CRUD with progressive-disclosure forms
- place browsing, search and quick filters
- "we went here today" and visit history
- `GET /api/today` deterministic recommendations with visible reasons
- manual weather picker (rain / sunny / windy / temperature) on the Today page

Not built yet: a real weather provider, photos, and the diary feed. The weather provider
seam is `api/services/weather.ts`.

## Requirements

- Deno 2.3+
- Node 20+ and npm (only to install the client's react/esbuild dependencies)

## Getting started

```sh
make install
make seed PASSWORD=<household password> PROFILES=Alice,Bob DEMO=--demo
make dev
```

Then open http://localhost:8777.

`make dev` runs the Deno server, which spawns the esbuild watcher for the client. Drop
`DEMO=--demo` if you would rather start with an empty database.

To reset the household password later:

```sh
make seed PASSWORD=<new password> FORCE=--force
```

## Commands

| Command      | What it does                                            |
| ------------ | ------------------------------------------------------- |
| `make install` | Install the client's npm dependencies                 |
| `make seed`    | Create the household, profiles and optional demo data |
| `make dev`     | Dev server on :8777 with client watch rebuilds        |
| `make build`   | Production client bundle into `api/client/`           |
| `make start`   | Build, then run the server with narrow permissions    |
| `make check`   | Type-check the api, scripts and client                |
| `make fmt`     | Format everything                                     |
| `make icons`   | Regenerate the app icons (output is committed)        |

## Layout

```
api/
  main.ts               entrypoint, dev client watcher
  server.ts             routing, static serving, request logging
  auth/                 password hashing, sessions, rate limit, origin check
  db/                   schema.sql and all SQL; no SQL lives in route handlers
  recommendations/      config.ts (all weights), engine.ts, weather.ts (classification)
  routes/               one file per resource, JSON in and out
  services/weather.ts   WeatherProvider seam; manual provider for now
  client/               generated client build output (gitignored)
client/
  build.ts              esbuild production build
  build-watch.ts        esbuild watch build used by `make dev`
  static/               index.html, manifest and app icons
  src/
    tokens.css          the whole visual system: colour, type, space, motion
    ui.module.css       shared surfaces, buttons, form controls
    icons.tsx           inline SVG icon set
    components/         Chip, Sheet, Skeleton, EmptyState
    pages/              one component and one stylesheet each
scripts/
  seed.ts               household, profiles and demo data
  make-icons.ts         generates the app icons, no image dependency
```

## Configuration

| Env var    | Default                | Notes                                  |
| ---------- | ---------------------- | -------------------------------------- |
| `PORT`     | `8777`                 |                                        |
| `HOST`     | `0.0.0.0`              |                                        |
| `DB_PATH`  | `api/.data/app.sqlite3` | SQLite file location                  |
| `DEV`      | unset                  | `1` enables the client watcher and drops `Secure` from the session cookie |
| `CLIENT_ROOT` | `api/client`        | Where static files are served from      |
| `TRUST_PROXY` | unset               | `1` makes the login rate limiter read `X-Forwarded-For`. Set it only when a reverse proxy that overwrites that header is in front |

No secrets live in this repository. The household password exists only as a PBKDF2 hash
in the SQLite file.

## Deployment

The server must sit behind an HTTPS reverse proxy or tunnel; it is not meant to face the
internet directly. `GET /api/health` verifies the app can reach its storage, and backups
need to cover both the SQLite file and (once photos land) the photo directory.

`deploy/` holds one worked deployment: a Docker image for the app plus a Tailscale
sidecar container that terminates TLS and exposes it over Tailscale Funnel, so the app
is reachable on the public internet without a port-forward and without the client
needing Tailscale. It is not the only option — any HTTPS reverse proxy in front of the
container works.

```sh
cp deploy/.env.example deploy/.env   # then fill in the three TS_* values
make deploy-build
make deploy-up                       # sidecar first, then the app
./deploy/seed.sh --password=<household password>
```

Two things to get right, both covered in [CLAUDE.md](CLAUDE.md):

- **`TRUST_PROXY=1` is required** behind a proxy, and only safe if that proxy overwrites
  `X-Forwarded-For`. Without it every request looks like it came from the proxy and the
  login rate limiter throttles all clients as one; with it in front of a proxy that
  merely forwards the header, a caller can forge a fresh limiter bucket per request.
- **Nothing in `deploy/` may be committed with real values in it.** `deploy/.env`,
  `deploy/serve.json` (generated) and `deploy/tailscale_state/` are gitignored.

## Tuning recommendations

All scoring weights live in `api/recommendations/config.ts`: the recency curve, the
never-visited boost, priority weight, travel-time bands and weather bonuses. Change them
there rather than in `engine.ts`.
