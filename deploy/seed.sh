#!/bin/bash
# Creates the household and profiles in the production volume. Run once after the first
# ./start.sh - until it runs, login has nothing to check the password against.
#
#   ./seed.sh --password=secret
#   ./seed.sh --password=secret --profiles=Alice,Bob --demo
#   ./seed.sh --password=newsecret --force      # reset the password
#
# The password is passed straight to the container and is never written to a file here.
# Personal shell helpers if available; plain fallbacks otherwise so this runs anywhere.
if [[ -f "${UTIL_SH:-$HOME/scripts/util.sh}" ]]; then
  . "${UTIL_SH:-$HOME/scripts/util.sh}"
else
  echo_green() { printf '\033[32m%s\033[0m\n' "$*"; }
  echo_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
  echo_red() { printf '\033[31m%s\033[0m\n' "$*"; }
fi
set -uo pipefail

CONTAINER_NAME=where-to-go-today

if ! docker ps --format '{{.Names}}' | grep -qx $CONTAINER_NAME; then
  echo_red "$CONTAINER_NAME is not running - start it with ./start.sh first"
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo_red "usage: ./seed.sh --password=... [--profiles=A,B] [--demo] [--force]"
  exit 1
fi

# --allow-write is scoped to the volume, matching the api's own permissions.
docker exec -w /app/scripts $CONTAINER_NAME \
  deno run --allow-read --allow-write=/app/data --allow-env seed.ts "$@"
