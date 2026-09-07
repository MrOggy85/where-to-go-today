# syntax=docker/dockerfile:1

# The client build needs npm *and* deno: client/deno.json sets `nodeModulesDir: manual`,
# so esbuild and react come from npm's node_modules, but build.ts is itself a Deno script.
FROM denoland/deno:bin-2.6.9 AS deno-bin

FROM node:24-bookworm-slim AS client
COPY --from=deno-bin /deno /usr/local/bin/deno
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# .git is not in the build context, so build.ts's `git rev-parse` fallback would tag the
# bundle 'dev' and break cache-busting. deploy/build.sh passes the real hash.
ARG BUILD_HASH=dev
ENV BUILD_HASH=$BUILD_HASH
# build.ts writes to ../api/client/, which has to exist before esbuild runs.
RUN mkdir -p /src/api/client && npm run build

FROM denoland/deno:2.6.9 AS runtime
WORKDIR /app/api
COPY api/ ./
# server.ts resolves its static root as ./client relative to its own module URL, so the
# bundle lands there and CLIENT_ROOT stays unset.
COPY --from=client /src/api/client ./client
# seed.ts imports ../api/db/*, so it has to keep its sibling layout. Without it a fresh
# volume has no household and login can never succeed. See deploy/seed.sh.
COPY scripts/ /app/scripts/
# Baked into the image so a cold start never has to reach jsr.io or npm.
RUN deno cache --config deno.json main.ts /app/scripts/seed.ts && chown -R 1000:1000 /deno-dir

# HOST is loopback because the Tailscale sidecar shares this container's network
# namespace and proxies over it; nothing should reach the api from anywhere else.
ENV HOST=127.0.0.1 \
    PORT=8777 \
    DB_PATH=/app/data/app.sqlite3 \
    TZ=Asia/Tokyo

USER 1000
# Mirrors api/deno.json's `start` task, with the write scope pointed at the volume.
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write=/app/data", "--allow-env", "main.ts"]
