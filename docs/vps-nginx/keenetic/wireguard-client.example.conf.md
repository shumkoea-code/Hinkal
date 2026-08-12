# Пример WireGuard-клиента для Keenetic (без секретов)

Скопируйте структуру; **PrivateKey / PublicKey** возьмите из файла на сервере:
`/root/keenetic-wg/keenetic-client.conf`

```ini
[Interface]
PrivateKey = <СЕКРЕТ_С_СЕРВЕРА>
Address = 10.0.8.2/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1280

[Peer]
PublicKey = <ПУБЛИЧНЫЙ_КЛЮЧ_СЕРВЕРА>
Endpoint = 77.110.125.241:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

Публичные параметры сервера:

| Поле | Значение |
| --- | --- |
| Endpoint | `77.110.125.241:51820` (или `v1.idivles.ru:51820`) |
| Протокол | WireGuard UDP |
| Клиентский IP | `10.0.8.2/32` |
| Серверный VPN IP | `10.0.8.1/24` |

Скачать готовый файл:

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/keenetic-client.conf .
```
