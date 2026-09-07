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
- Never log session cookies, passwords, password hashes, note contents or home
  coordinates.
- No new runtime dependencies without a real need. No ORM, router, state library or UI
  framework.

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
