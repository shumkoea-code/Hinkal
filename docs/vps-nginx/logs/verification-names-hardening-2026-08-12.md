# Verification — names + hardening 2026-08-12

## Display names in subscription
- ТЕЛ+ПК · TLS-WS ★ (-login on first link — OK)
- ТЕЛ+ПК · gRPC (tls)
- ТЕЛ+ПК · gRPC (none)
- ПК·WiFi · Stealth Reality
- ПК·WiFi · Speed Vision
- ПК·WiFi · Alt Samsung

## Hardening
- UFW cleaned (only 80/443/444/2096/4488/10000/20000)
- iperf3 stopped
- BBR + fq + syncookies
- SSH MaxAuthTries/LoginGraceTime
- unattended-upgrades
- nginx security headers on v1 mask

## Dial
All 6 sub links OK; tyoung/v1 200
