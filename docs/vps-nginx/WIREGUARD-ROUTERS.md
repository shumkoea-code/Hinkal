# Установка WireGuard: Keenetic и MikroTik

**Сервер:** `77.110.125.241` · порт **UDP 51820** · туннель `10.0.8.0/24`  
**Проверено на VPS:** handshake WG OK · DNS-аудит с дедупом ресурсов OK (12.08.2026)

## Рекомендуемый путь: веб-панель (1 клик)

1. Админ: `https://v1.idivles.ru:8447/` → создать пир → скачать `.conf` **или** «Создать ссылку».
2. Пользователь открывает share-ссылку (без пароля админа) → скачивает конфиг / QR.
3. Импорт на роутер — разделы ниже.

Полное описание панели, бана IP и деплоя: **[WG-PANEL.md](./WG-PANEL.md)**.

---

Секреты (приватные ключи) **не в git**. Альтернатива без панели — скачать готовые файлы с сервера:

```bash
# Keenetic
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/keenetic-client.conf .

# MikroTik (текстовый .conf + скрипт .rsc)
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/mikrotik-client.conf .
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/mikrotik-setup.rsc .
```

| Роутер | VPN IP | Файл |
| --- | --- | --- |
| Keenetic | `10.0.8.2/32` | `keenetic-client.conf` |
| MikroTik | `10.0.8.3/32` | `mikrotik-client.conf` / `mikrotik-setup.rsc` |

DNS в клиентах: **`10.0.8.1`** (для учёта посещений на сервере, см. §4).

Связанные документы: [WG-PANEL.md](./WG-PANEL.md) · [KEENETIC-ROUTER.md](./KEENETIC-ROUTER.md) · [WG-AUDIT.md](./WG-AUDIT.md)

---

## 0. Что нужно понимать заранее

1. WireGuard на Keenetic и MikroTik — **штатный** клиент (без Entware / без VLESS).
2. Весь LAN за роутером пойдёт в VPN **только если** вы включите маршрут `0.0.0.0/0` через WG (ниже — как).
3. MTU ставьте **1280** (на практике стабильнее на домашних каналах, чем 1420).
4. Endpoint надёжнее по **IP** `77.110.125.241`, не по домену (на старте роутера DNS может ещё не работать).
5. После импорта конфига проверьте handshake на сервере: `wg show wg0`.

---

## 1. Keenetic — пошагово (проверено по схеме)

Подходит для KeeneticOS с разделом **WireGuard** (большинство актуальных моделей).

### 1.1. Скачать конфиг

На ПК:

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/keenetic-client.conf .
```

Откройте файл — внутри должны быть:

- `Address = 10.0.8.2/32`
- `DNS = 10.0.8.1`
- `Endpoint = 77.110.125.241:51820`
- `PersistentKeepalive = 25`
- `MTU = 1280`

### 1.2. Импорт в веб-интерфейс

1. Откройте веб-морду Keenetic (обычно `http://192.168.1.1`).
2. **Интернет → Другие подключения** (или **VPN**).
3. **WireGuard → Добавить соединение**.
4. Импорт из файла `keenetic-client.conf`  
   **или** вручную перенесите поля:

| Поле Keenetic | Откуда в файле |
| --- | --- |
| IPv4-адрес | `[Interface] Address` → `10.0.8.2/32` |
| Приватный ключ | `[Interface] PrivateKey` |
| Публичный ключ пира | `[Peer] PublicKey` |
| Конечная точка | `[Peer] Endpoint` → `77.110.125.241:51820` |
| Разрешённые подсети | `[Peer] AllowedIPs` → `0.0.0.0/0` (и `::/0` если есть) |
| Keepalive | `25` |
| MTU | `1280` |
| DNS | `10.0.8.1` |

5. Включите соединение (тумблер On).
6. Дождитесь статуса вроде «подключено» / появления трафика.

### 1.3. Чтобы интернет устройств шёл через VPN

В зависимости от версии KeeneticOS:

- **Приоритет подключений** — поднимите WireGuard выше провайдера, **или**
- **Политики / маршрутизация** — назначьте WG нужным устройствам / всему сегменту Home.

Без этого туннель может быть «вверх», а LAN по-прежнему ходит напрямую в ISP.

### 1.4. Проверка

| Где | Что смотреть |
| --- | --- |
| Keenetic | Статус WG, TX/RX растут |
| Сервер | `wg show wg0` — у peer `10.0.8.2` есть `latest handshake` |
| Устройство в Wi‑Fi | https://ifconfig.me → IP `77.110.125.241` |
| DNS-учёт | на сервере `wg-audit-report` — запросы с peer `keenetic` |

### 1.5. Типичные проблемы Keenetic

| Симптом | Что сделать |
| --- | --- |
| Нет handshake | UDP 51820 режут; проверьте endpoint IP; MTU 1280 |
| Handshake есть, интернета нет | Не настроен приоритет/маршрут через WG |
| Сайты открываются, учёт пустой | DNS не `10.0.8.1` (клиент ходит в 8.8.8.8 напрямую) |

---

## 2. MikroTik — пошагово (RouterOS 7+)

Нужен **RouterOS v7** (WireGuard встроен). Проверено по официальной модели настройки Winbox/CLI; готовый `.rsc` лежит на сервере.

### 2.1. Способ A — импорт скрипта (быстрее)

1. Скачайте:

```bash
scp -P 4488 root@77.110.125.241:/root/keenetic-wg/mikrotik-setup.rsc .
```

2. Winbox / WebFig: **Files** → Upload `mikrotik-setup.rsc`.
3. Terminal:

```text
/import file-name=mikrotik-setup.rsc
```

4. Проверка:

```text
/interface/wireguard/print
/interface/wireguard/peers/print
/ip/address/print where interface=wg-idivles
```

У peer должен появиться endpoint и (после трафика) handshake.

### 2.2. Способ B — Winbox вручную

#### Шаг 1. Интерфейс

**WireGuard → WireGuard → +**

| Поле | Значение |
| --- | --- |
| Name | `wg-idivles` |
| MTU | `1280` |
| Private Key | из `mikrotik-client.conf` → `[Interface] PrivateKey` |
| Listen Port | любой свободный, напр. `13231` (это локальный порт, не 51820 сервера) |

Public Key MikroTik заполнится сам — на сервере peer уже привязан к выданному ключу из файла.

#### Шаг 2. Peer

**WireGuard → Peers → +**

| Поле | Значение |
| --- | --- |
| Interface | `wg-idivles` |
| Name | `peer-idivles` |
| Public Key | `[Peer] PublicKey` из конфига (ключ **сервера**) |
| Endpoint | `77.110.125.241` |
| Endpoint Port | `51820` |
| Allowed Address | `0.0.0.0/0` и при необходимости `::/0` |
| Persistent Keepalive | `00:00:25` (25 секунд) |

#### Шаг 3. Адрес на интерфейсе

**IP → Addresses → +**

| Поле | Значение |
| --- | --- |
| Address | `10.0.8.3/32` |
| Interface | `wg-idivles` |

#### Шаг 4. DNS (для учёта на сервере)

**IP → DNS**

- Servers: `10.0.8.1`
- Allow Remote Requests: yes (если MikroTik раздаёт DNS LAN)

Клиентам LAN в DHCP укажите DNS = IP MikroTik (или сразу `10.0.8.1`, если маршрут до него есть).

#### Шаг 5. Маршрут в туннель

**Полный туннель (весь интернет через WG):**

**IP → Routes → +**

| Поле | Значение |
| --- | --- |
| Dst. Address | `0.0.0.0/0` |
| Gateway | `wg-idivles` |
| Distance | `1` (или выше приоритет, чем у ISP) |

**Только часть устройств (policy routing)** — отдельная routing table + `ip firewall mangle` mark-routing (не разбираем здесь подробно; для начала достаточно full-tunnel).

### 2.3. CLI-эквивалент (без секретов)

```text
/interface wireguard
add name=wg-idivles listen-port=13231 mtu=1280 private-key="<ИЗ_ФАЙЛА>"

/interface wireguard peers
add interface=wg-idivles name=peer-idivles \
    public-key="<ПУБЛИЧНЫЙ_КЛЮЧ_СЕРВЕРА>" \
    endpoint-address=77.110.125.241 endpoint-port=51820 \
    allowed-address=0.0.0.0/0,::/0 \
    persistent-keepalive=00:00:25

/ip address
add address=10.0.8.3/32 interface=wg-idivles

/ip dns
set servers=10.0.8.1 allow-remote-requests=yes

/ip route
add dst-address=0.0.0.0/0 gateway=wg-idivles distance=1 comment="idivles-wg-full"
```

Готовый файл с ключами: `mikrotik-setup.rsc` на сервере.

### 2.4. Проверка MikroTik

```text
/interface/wireguard/peers/print detail
```

Ищите `last-handshake` / трафик RX/TX.

На сервере:

```bash
wg show wg0
# peer 10.0.8.3 — latest handshake
```

С LAN за MikroTik: внешний IP = `77.110.125.241`.

### 2.5. Типичные проблемы MikroTik

| Симптом | Что сделать |
| --- | --- |
| Нет handshake | Нет UDP наружу; неверный public key сервера; endpoint |
| Handshake есть, нет интернета | Нет route `0.0.0.0/0` → `wg-idivles` или distance хуже ISP |
| NAT/фаервол | Разрешите forward из LAN в `wg-idivles`, masquerade обычно на WAN — для full WG часто нужен accept forward |
| DNS-учёт пуст | LAN не использует `10.0.8.1` |

---

## 3. Быстрая сверка двух роутеров

| | Keenetic | MikroTik |
| --- | --- | --- |
| Где в UI | Интернет → WireGuard | WireGuard + IP → Addresses/Routes |
| VPN IP | `10.0.8.2` | `10.0.8.3` |
| Импорт | `.conf` | `.rsc` или вручную |
| MTU | 1280 | 1280 |
| Keepalive | 25 | 00:00:25 |
| DNS для аудита | 10.0.8.1 | 10.0.8.1 |

**Нельзя** копировать один и тот же private key на два роутера — у каждого свой peer.

---

## 4. Контроль WG: куда ходит пользователь и лог с ID

### Важно

Сам WireGuard **не пишет**, на какие сайты ходит клиент. Он видит только:

- handshake peer’а;
- сколько байт up/down на туннель.

Чтобы знать «куда ходили», на сервере сделан **DNS-аудит** для клиентов WG:

1. Клиент использует DNS **`10.0.8.1`** (dnsmasq на `wg0`).
2. Запросы пишутся в `/var/log/wg-audit/dns.log`.
3. Сборщик кладёт данные в SQLite `/var/lib/wg-audit/audit.db`:
   - таблица **`resources`** — уникальный домен → **числовой `id`**, счётчик `hits`;
   - таблица **`events`** — время + peer + **resource_id** (не повторяет длинное имя каждый раз);
   - таблица **`peers`** — keenetic / mikrotik и их `10.0.8.x`.

Повторный заход на `youtube.com` **не плодит новую строку ресурса** — растёт `hits`, в events пишется тот же `rid`.

Подробности и команды: **[WG-AUDIT.md](./WG-AUDIT.md)**.

Кратко на сервере:

```bash
wg show wg0
wg-audit-report
```

### Ограничения учёта

| Видит | Не видит (без доп. DPI) |
| --- | --- |
| DNS-имена, которые резолвили через 10.0.8.1 | IP, набранные в обход DNS (DoH в браузере, hardcode IP) |
| Какой peer (Keenetic/MikroTik) спросил | Полный URL пути (`/watch?v=…`) |
| Повторы сжаты в id | Содержимое HTTPS |

Если нужен ещё и учёт «сырых» IP без DNS — следующий шаг: conntrack/nflog по `10.0.8.0/24` с той же таблицей `resources(kind='ip')` (пока не включено по умолчанию, чтобы не раздувать диск).

---

## 5. Админу: где что лежит

| Путь | Назначение |
| --- | --- |
| `/etc/wireguard/wg0.conf` | Сервер + peers |
| `/root/keenetic-wg/*.conf` | Клиентские конфиги |
| `/root/keenetic-wg/mikrotik-setup.rsc` | Импорт MikroTik |
| `/var/lib/wg-audit/audit.db` | Сжатый журнал |
| `/usr/local/sbin/wg-audit-report` | Отчёт |
| `systemctl status wg-quick@wg0 dnsmasq wg-audit-collect` | Сервисы |
