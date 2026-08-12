# Verification — mobile fix 2026-08-12

## Problem
Phone: only gRPC worked; Stealth/Speed/Alt Reality failed (likely mobile DPI on fake SNI).

## Fix
- Mobile-TLS-WS inbound :10447 behind nginx TLS on v1.idivles.ru:443
- gRPC externalProxy TLS variant via /gun
- Sub order puts mobile profiles first
- Reality shortIds length >= 8

## Sub links (shumkoea) after fix
1. Mobile-TLS-WS — ws/tls v1:443 — OK
2. gRPC-443 — grpc/tls v1:443 — OK
3. gRPC-443 — grpc/none v1:443 — OK
4. Stealth / Speed / Alt Reality — OK from VPS (may still fail on LTE)

## Sites
tyoung 200, v1 200
