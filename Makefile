.PHONY: install seed dev build start check fmt icons deploy-build deploy-up deploy-logs

# The client needs react + esbuild; the api has no dependencies.
install:
	npm --prefix client install

# Create the household, its two profiles and (optionally) demo places.
#   make seed PASSWORD=secret PROFILES=Alice,Bob
#   make seed PASSWORD=secret DEMO=--demo
#   make seed PASSWORD=newsecret FORCE=--force   # reset the password
PROFILES ?= Adult 1,Adult 2
seed:
	deno run -A scripts/seed.ts --password="$(PASSWORD)" --profiles="$(PROFILES)" $(DEMO) $(FORCE)

# Deno server on :8777, which spawns the esbuild watcher for the client.
dev:
	deno task --cwd api dev

# Production bundle into api/client/.
build:
	npm --prefix client run build

start: build
	deno task --cwd api start

check:
	deno check --config api/deno.json api/main.ts scripts/seed.ts
	npm --prefix client run check

fmt:
	deno fmt --config api/deno.json api scripts
	deno fmt --config client/deno.json client

# Regenerate the app icons from the mark in scripts/make-icons.ts. Output is committed,
# so this only needs running when the mark or the accent colour changes.
icons:
	deno run --allow-write=client/static scripts/make-icons.ts

# --- Deployment (Docker + Tailscale Funnel sidecar; see deploy/ and CLAUDE.md) --------
# These act on the production container, not the working tree. `make dev` is unaffected.

deploy-build:
	./deploy/build.sh

# Sidecar first: the app container joins its network namespace.
deploy-up:
	./deploy/sidecar.sh && ./deploy/start.sh

deploy-logs:
	docker logs -f where-to-go-today
