#!/bin/bash
# Starts the api container. Requires the sidecar to be running first: this container
# joins the sidecar's network namespace and cannot start without it.
# Personal shell helpers if available; plain fallbacks otherwise so this runs anywhere.
if [[ -f "${UTIL_SH:-$HOME/scripts/util.sh}" ]]; then
  . "${UTIL_SH:-$HOME/scripts/util.sh}"
else
  echo_green() { printf '\033[32m%s\033[0m\n' "$*"; }
  echo_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
  echo_red() { printf '\033[31m%s\033[0m\n' "$*"; }
fi
set -uo pipefail

cd "$(dirname "$0")"

# Only to print the URL at the end; the app itself never needs to know its hostname.
[[ -f .env ]] && . ./.env

CONTAINER_NAME=where-to-go-today
SIDECAR_NAME=wtgt-tailscale

if ! docker ps --format '{{.Names}}' | grep -qx $SIDECAR_NAME; then
  echo_red "$SIDECAR_NAME is not running - start it with ./sidecar.sh first"
  exit 1
fi

mkdir -p data

echo_yellow "stopping..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm -f $CONTAINER_NAME 2>/dev/null || true

echo_yellow "starting..."
docker run \
  -d \
  --name $CONTAINER_NAME \
  -u 1000 \
  --network=container:$SIDECAR_NAME \
  -v "$PWD/data:/app/data" \
  -e TZ=Asia/Tokyo \
  -e TRUST_PROXY=1 \
  --restart=always \
  where-to-go-today:latest

# TRUST_PROXY is set deliberately and is not optional here. The login throttle in
# api/auth/guard.ts keys on the client IP; behind the sidecar every request arrives over
# loopback, so without it the entire internet shares one 10-per-15-minute bucket and ten
# bad guesses lock out the household. Safe only because the sidecar overwrites
# X-Forwarded-For - never set it when the api is reachable directly.

echo_green "app up: https://${TS_HOSTNAME:-<host>}.${TS_TAILNET:-<tailnet>}"
docker logs -f $CONTAINER_NAME
