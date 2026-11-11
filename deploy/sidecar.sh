#!/bin/bash

# Rootless daemon (since 2026-11-11). Named rather than trusted from the active context.
export DOCKER_CONTEXT=rootless
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
# Pinned by digest (v1.102.3): the entrypoint wrapper calls containerboot by path, and an
# image that moved under it would fail on a restart nobody asked for. Upgrade deliberately.
IMAGE=tailscale/tailscale@sha256:8c42c4574ab066384fcb72f69e086a2ff1dd3652eb6f56856cee34bcf0d2f680

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
  --device /dev/net/tun \
  -v "$PWD/serve.json:/config/serve.json:ro" \
  -v "$PWD/egress-firewall.sh:/config/egress-firewall.sh:ro" \
  --entrypoint /bin/sh \
  --dns 8.8.8.8 \
  --network=bridge \
  --cap-drop ALL \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  --cap-add=NET_BIND_SERVICE \
  --security-opt no-new-privileges \
  -e TS_AUTHKEY="$TS_AUTHKEY" \
  -e TS_STATE_DIR=/var/lib/tailscale \
  -e TS_SERVE_CONFIG=/config/serve.json \
  -e TS_HOSTNAME="$TS_HOSTNAME" \
  -e TS_USERSPACE=false \
  -e TS_EXTRA_ARGS="--accept-dns=false" \
  --restart=always \
  "$IMAGE" /config/egress-firewall.sh

# egress-firewall.sh is the entrypoint, and it is not optional: it confines the app's
# uid to DNS and public HTTPS before tailscaled starts, on every restart. Without it the
# app can reach every tailnet device, the host's ports and the LAN. It ends by exec'ing
# the image's own containerboot.
#
# SYS_MODULE was dropped 2026-11-05: root in a container that may load kernel modules is
# root on the host, and the tun module the image would load is already loaded.

# Rootless since 2026-11-11: container root is oskar on the host, so everything
# tailscaled writes to tailscale_state/ lands oskar-owned by itself. The chown step
# (and chown-state.sh) that the rootful daemon needed is gone.
#
# Capabilities: ALL dropped, then NET_ADMIN (tun device, routes, the egress rules),
# NET_RAW (iptables and tailscaled's raw sockets) and NET_BIND_SERVICE (:443).
# Without CHOWN/DAC_OVERRIDE, container root can only touch files oskar owns.

echo_green "sidecar up for $PUBLIC_HOSTNAME. next: ./start.sh"
