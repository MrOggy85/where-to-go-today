# syntax=docker/dockerfile:1

# The deploy tooling for the Cloudflare build: wrangler (deploy, D1, R2, local dev) and
# deno + npm for the client bundle. Built locally by ./wr, never pushed. Nothing here runs
# in production; the Worker itself is bundled by wrangler and runs on Cloudflare.

# deno: client/build.ts is a Deno script (see the main Dockerfile for why).
FROM denoland/deno:bin-2.6.9@sha256:4e3c4ae12c77815f5872480df7bcd4f472b0badd38d84fe6eb9ec12df386dc0d AS deno-bin

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
COPY --from=deno-bin /deno /usr/local/bin/deno
# workerd (wrangler dev, local D1) refuses to start without a CA store, and the slim base
# has none.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/cloudflare
COPY package.json package-lock.json ./
# Exact versions from the lockfile. wrangler's postinstall fetches workerd, the local
# runtime `wrangler dev` uses, for this platform.
RUN npm ci --no-audit --no-fund
ENV PATH=/opt/cloudflare/node_modules/.bin:$PATH \
    WRANGLER_SEND_METRICS=false

# Fail the build, not the deploy, if a base change breaks either tool.
RUN wrangler --version && deno --version && tsc --version
