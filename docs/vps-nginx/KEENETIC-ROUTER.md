# Keenetic: какой VPN ставить и как

**Сервер:** `v1.idivles.ru` / `77.110.125.241`  
**Дата:** 12 августа 2026

Готовый WireGuard-конфиг для вашего Keenetic лежит **на сервере** (не в git — там приватный ключ):

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/keenetic-client.conf .
```

Также: `keenetic-client-domain.conf`, JSON для XKeen — в той же папке `/root/keenetic-wg/`.

---

## 1. Короткий ответ

| Способ | Нужно на роутере | Что брать с нашего сервера | Сложность |
| --- | --- | --- | --- |
| **WireGuard (штатный)** | Любой Keenetic с WG в прошивке | Конфиг `keenetic-client.conf` (UDP **51820**) | ★ легко |
| **XKeen + VLESS** | USB + Entware + XKeen | Из подписки: **ТЕЛ+ПК · TLS-WS ★** или **ПК·WiFi · Speed Vision** | ★★★ сложнее |
| Reality XHTTP (Stealth/Alt) | XKeen | Можно, но тяжелее для CPU роутера | не рекомендуем первым |
| gRPC / только телефонные клиенты | — | Не для штатного Keenetic UI | — |

**Вывод:** для Keenetic «из коробки» — **WireGuard**.  
Если провайдер режет WG — тогда **Entware → XKeen** и профиль **TLS-WS ★** (или Speed Vision).

Штатный Keenetic **не умеет** VLESS/Reality без Entware/XKeen.

---

## 2. Вариант A — WireGuard (рекомендуется)

### Что уже сделано на сервере

| Параметр | Значение |
| --- | --- |
| Интерфейс | `wg0` |
| Порт | **UDP 51820** (открыт в UFW) |
| Адрес сервера в туннеле | `10.0.8.1/24` |
| Адрес роутера (peer) | `10.0.8.2/32` |
| Автозапуск | `wg-quick@wg0` enabled |
| Проверка | Handshake через `77.110.125.241:51820` — OK |

### Настройка в веб-интерфейсе Keenetic

1. Скачайте `keenetic-client.conf` с сервера (команда выше).
2. Keenetic: **Интернет → Другие подключения → WireGuard → Добавить соединение**.
3. Импорт из файла **или** вручную:

| Поле | Значение |
| --- | --- |
| Адрес / IPv4 | `10.0.8.2/32` (из `[Interface] Address`) |
| Приватный ключ | из `[Interface] PrivateKey` |
| Публичный ключ пира | из `[Peer] PublicKey` |
| Endpoint | `77.110.125.241:51820` (надёжнее IP) или `v1.idivles.ru:51820` |
| Allowed IPs | `0.0.0.0/0` (весь трафик) или выборочно |
| Persistent keepalive | `25` |
| MTU | **1280** (на Keenetic часто стабильнее, чем 1420) |
| DNS | `1.1.1.1` / `8.8.8.8` |

4. Включите соединение.
5. **Приоритет подключения / политика маршрутизации:** назначьте, какие устройства или весь LAN идут в WG (зависит от версии KeeneticOS: «Подключения», «Приоритеты», политики маршрутизации).

### Проверка

- В статусе WG на Keenetic должен появиться handshake / трафик.
- На сервере: `wg show wg0` — у peer Keenetic появятся `latest handshake` и transfer.
- С устройства за роутером: «what is my ip» → `77.110.125.241`.

### Если WireGuard не поднимается

1. Провайдер режет UDP 51820 → смените порт на сервере (админ) или переходите к варианту B.  
2. MTU: попробуйте `1280` / `1200`.  
3. Endpoint только по IP, не по домену.  
4. AllowedIPs для теста: сначала `10.0.8.1/32`, ping `10.0.8.1`, потом полный `0.0.0.0/0`.

---

## 3. Вариант B — VLESS через XKeen (Entware)

Нужны: **USB** (ext4), компоненты USB/OPKG, пакет **XKeen** (обёртка над Xray).

### Какие наши профили лучше для роутера

| Приоритет | Имя в подписке | Почему |
| --- | --- | --- |
| 1 | **ТЕЛ+ПК · TLS-WS ★** | Обычный TLS на свой домен — устойчивее к DPI, проще WS |
| 2 | **ПК·WiFi · Speed Vision** | Reality + TCP + Vision — без XHTTP, легче для CPU |
| 3 | Stealth / Alt (XHTTP) | Работают, но XHTTP тяжелее на слабых Keenetic |

**Не** используйте порты `1044x` — только `v1.idivles.ru:443`.

### Куда класть конфиг

Обычно: `/opt/etc/xray/configs/04_outbounds.json` (в терминах XKeen).

На сервере уже сгенерированы образцы (с UUID клиента `shumkoea` — для других пользователей берите свою подписку / пересоберите JSON):

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/xkeen-04_outbounds-TLS-WS.json .
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/xkeen-04_outbounds-SPEED-Vision.json .
```

Либо конвертер XKeen: вставить vless:// из  
`https://v1.idivles.ru:2096/sub/pepewtfa/<subId>`.

Затем: `xkeen -start` / `xkeen -status`, политика маршрутизации в Keenetic на нужных клиентов.

Подробные гайды по установке Entware/XKeen — на сайте документации XKeen / Keenetic (USB, отключение штатного SSH при конфликте с Entware SSH на 222).

---

## 4. Чего Keenetic «сам» не съест

| Профиль с телефона/ПК | В штатном UI Keenetic |
| --- | --- |
| ТЕЛ+ПК · TLS-WS ★ | Нет (нужен XKeen) |
| ТЕЛ+ПК · gRPC | Нет |
| ПК·WiFi · Reality * | Нет |
| WireGuard (наш :51820) | **Да** |

---

## 5. Безопасность

- Приватный ключ WG **не коммитится** в git.  
- Не светите `keenetic-client.conf` в публичных чатах.  
- Для второго роутера — новый peer (`wg genkey`, `AllowedIPs=10.0.8.3/32`), не копируйте один ключ на два устройства.  
- UFW: `51820/udp` разрешён осознанно под Keenetic.

---

## 6. Админу: где лежит на VPS

| Путь | Содержание |
| --- | --- |
| `/etc/wireguard/wg0.conf` | Сервер + peer Keenetic |
| `/root/keenetic-wg/keenetic-client.conf` | Клиент для импорта |
| `/root/keenetic-wg/xkeen-*.json` | Outbounds для XKeen |
| `systemctl status wg-quick@wg0` | Сервис |

Добавить ещё один роутер:

```bash
wg genkey | tee /root/keenetic-wg/router2.key | wg pubkey
# wg set wg0 peer <PUB> allowed-ips 10.0.8.3/32
# дописать [Peer] в wg0.conf и выдать клиенту Address=10.0.8.3/32
```
