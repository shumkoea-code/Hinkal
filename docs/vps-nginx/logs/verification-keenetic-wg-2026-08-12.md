# Verification — Keenetic WireGuard 2026-08-12

- wg0 ListenPort 51820, peer 10.0.8.2/32
- UFW 51820/udp allow
- wg-quick@wg0 enabled
- Handshake test via 77.110.125.241:51820 — OK
- Client config: /root/keenetic-wg/keenetic-client.conf (not in git)
- XKeen JSON samples: TLS-WS + Speed Vision in same dir
- Docs: KEENETIC-ROUTER.md
