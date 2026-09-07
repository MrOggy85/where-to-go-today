#!/bin/bash
# Tailscale sidecar. Owns the public hostname, terminates TLS and proxies to the api
# over the network namespace it shares with the app container.
#
# Start this BEFORE start.sh: the app joins this container's namespace, so it cannot
# start until this one exists.
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

CONTAINER_NAME=wtgt-tailscale

# The auth key is NOT inline here: this is a public repo, and PROJECT.md section 17
# requires it to contain no production secrets.
if [[ ! -f .env ]]; then
  echo_red "deploy/.env is missing - copy .env.example and add a Tailscale auth key"
  exit 1
fi
. ./.env
for var in TS_AUTHKEY TS_HOSTNAME TS_TAILNET; do
  if [[ -z "${!var:-}" ]]; then
    echo_red "$var is not set in deploy/.env (see .env.example)"
    exit 1
  fi
done

# serve.json is generated, not committed: it would otherwise publish the tailnet name.
PUBLIC_HOSTNAME="$TS_HOSTNAME.$TS_TAILNET"
sed "s/__PUBLIC_HOSTNAME__/$PUBLIC_HOSTNAME/g" serve.json.template > serve.json

mkdir -p tailscale_state

echo_yellow "stopping..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm -f $CONTAINER_NAME 2>/dev/null || true

echo_yellow "starting..."
docker run \
  -d \
  --name $CONTAINER_NAME \
  -v "$PWD/tailscale_state:/var/lib/tailscale" \
  -v /dev/net/tun:/dev/net/tun \
  -v "$PWD/serve.json:/config/serve.json:ro" \
  --dns 8.8.8.8 \
  --network=bridge \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --cap-add=NET_BIND_SERVICE \
  -e TS_AUTHKEY="$TS_AUTHKEY" \
  -e TS_STATE_DIR=/var/lib/tailscale \
  -e TS_SERVE_CONFIG=/config/serve.json \
  -e TS_HOSTNAME="$TS_HOSTNAME" \
  -e TS_USERSPACE=false \
  -e TS_EXTRA_ARGS="--accept-dns=false" \
  --restart=always \
  tailscale/tailscale

# tailscaled runs as root inside the container (kernel mode needs iptables), so
# everything it writes to tailscale_state/ lands root-owned. Nothing there is committed
# in this repo, but root-owned files still break `git status` and plain-user backups.
echo_yellow "waiting for state, then fixing ownership..."
sleep 10
docker exec $CONTAINER_NAME chown -R 1000:1000 /var/lib/tailscale \
  && echo_green "tailscale_state/ owned by uid 1000" \
  || echo_red "chown failed - state will stay root-owned"

echo_green "sidecar up for $PUBLIC_HOSTNAME. next: ./start.sh"
