#!/bin/bash

# Rootless daemon (since 2026-11-11). Named rather than trusted from the active context.
export DOCKER_CONTEXT=rootless
# Builds the app image. Separate from start.sh so a rebuild is always deliberate.
# Personal shell helpers if available; plain fallbacks otherwise so this runs anywhere.
if [[ -f "${UTIL_SH:-$HOME/scripts/util.sh}" ]]; then
  . "${UTIL_SH:-$HOME/scripts/util.sh}"
else
  echo_green() { printf '\033[32m%s\033[0m\n' "$*"; }
  echo_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
  echo_red() { printf '\033[31m%s\033[0m\n' "$*"; }
fi
set -uo pipefail

cd "$(dirname "$0")/.."


# .git is excluded from the build context, so the hash has to be passed in - without it
# build.ts tags the bundle 'dev' and index.html stops busting the browser cache.
BUILD_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo dev)
# Tagged with the commit, never :latest. start.sh runs the image ID this writes to
# deploy/.image, so a tag moved by a later build cannot change what is deployed.
IMAGE=where-to-go-today:$BUILD_HASH

echo_yellow "building $IMAGE (BUILD_HASH=$BUILD_HASH)..."
docker build --build-arg "BUILD_HASH=$BUILD_HASH" -t "$IMAGE" . \
  || { echo_red "build failed"; exit 1; }
docker image inspect --format '{{.Id}}' "$IMAGE" > deploy/.image \
  && echo_green "built $IMAGE = $(<deploy/.image) (deploy/.image; ./deploy/start.sh runs it)"
