#!/bin/sh
# Runs INSIDE the sidecar, as root, on every start - sidecar.sh makes it the
# entrypoint, so the rules are back after any restart or reboot before
# tailscaled is up. Then it hands over to the image's own containerboot.
#
# Why: the app shares this container's network namespace, and this namespace is
# a tailnet node sitting on the host's docker bridge. Without these rules a
# compromised app can open connections to every tailnet device, every port the
# host listens on, and the home LAN. The rules match the app's uid (1000) only;
# tailscaled runs as root and is untouched. The app has no capabilities, so it
# cannot change them from inside.
#
# What uid 1000 may still do: answer connections made to it (the Funnel proxy,
# over loopback), resolve DNS, and open HTTPS to the public internet - the
# country list refetch needs that. Everything else is rejected.
#
# nft variants on purpose: tailscaled manages its own rules with iptables-legacy,
# and the legacy ip6tables filter table is not loaded on the host.
set -eu

APP_UID=1000
CHAIN=WTGT-EGRESS

for ipt in iptables-nft ip6tables-nft; do
  $ipt -N $CHAIN 2>/dev/null || $ipt -F $CHAIN
  $ipt -C OUTPUT -m owner --uid-owner $APP_UID -j $CHAIN 2>/dev/null \
    || $ipt -I OUTPUT -m owner --uid-owner $APP_UID -j $CHAIN
  $ipt -A $CHAIN -o lo -j RETURN
  $ipt -A $CHAIN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
done

# IPv4: DNS to the one resolver the sidecar is given, then HTTPS anywhere that
# is not private, tailnet, link-local or multicast.
iptables-nft -A $CHAIN -d 8.8.8.8 -p udp --dport 53 -j RETURN
iptables-nft -A $CHAIN -d 8.8.8.8 -p tcp --dport 53 -j RETURN
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 224.0.0.0/4; do
  iptables-nft -A $CHAIN -d $net -j REJECT
done
iptables-nft -A $CHAIN -p tcp --dport 443 -j RETURN
iptables-nft -A $CHAIN -j REJECT

# IPv6: global unicast only, which excludes the tailnet (fd7a::/48 is ULA).
ip6tables-nft -A $CHAIN -d 2000::/3 -p tcp --dport 443 -j RETURN
ip6tables-nft -A $CHAIN -j REJECT

echo "egress-firewall: uid $APP_UID limited to DNS + public HTTPS"
exec /usr/local/bin/containerboot
