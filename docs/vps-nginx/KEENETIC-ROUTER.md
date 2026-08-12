# Краткая карточка: Keenetic + WireGuard

Полная инструкция (Keenetic **и** MikroTik + учёт):  
**[WIREGUARD-ROUTERS.md](./WIREGUARD-ROUTERS.md)**

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/keenetic-client.conf .
```

1. Keenetic → Интернет → WireGuard → импорт файла.  
2. MTU 1280, DNS `10.0.8.1`, Endpoint `77.110.125.241:51820`.  
3. Включить приоритет/политику, чтобы LAN шёл в WG.  
4. Проверка: внешний IP = `77.110.125.241`.

Если провайдер режет WG → Entware/XKeen и профили **TLS-WS ★** / **Speed Vision** (см. ниже по ссылке в старом гайде / DETAILED-INSTRUCTION).
