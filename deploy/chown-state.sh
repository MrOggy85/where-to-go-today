#!/bin/bash
# tailscaled runs as root in the container, so tailscale_state/ files it writes are
# root-owned. tailscale_state/ is gitignored in this repo, so this is not about git - it
# is so a plain-user backup of deploy/ does not fail on permission denied.
# Personal shell helpers if available; plain fallbacks otherwise so this runs anywhere.
if [[ -f "${UTIL_SH:-$HOME/scripts/util.sh}" ]]; then
  . "${UTIL_SH:-$HOME/scripts/util.sh}"
else
  echo_green() { printf '\033[32m%s\033[0m\n' "$*"; }
  echo_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
  echo_red() { printf '\033[31m%s\033[0m\n' "$*"; }
fi
set -uo pipefail

CONTAINER_NAME=wtgt-tailscale

if ! docker ps --format '{{.Names}}' | grep -qx $CONTAINER_NAME; then
  echo_red "$CONTAINER_NAME is not running - start it with ./sidecar.sh first"
  exit 1
fi

docker exec $CONTAINER_NAME chown -R 1000:1000 /var/lib/tailscale \
  && echo_green "tailscale_state/ owned by uid 1000" \
  || { echo_red "chown failed"; exit 1; }
