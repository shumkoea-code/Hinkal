# Защита и оптимизация сервера

**Хост:** `v1.idivles.ru` (`77.110.125.241`)  
**Дата проверки/правок:** 12 августа 2026

Пароли в документ не входят. Снимки: [live/ufw-status.txt](./live/ufw-status.txt), [live/99-idivles-harden.conf](./live/99-idivles-harden.conf).

---

## 1. Что проверили

| Область | Было | Стало / статус |
| --- | --- | --- |
| UFW | Много лишних портов (22, 440–445, 5201 iperf, 51820, 33333, 30001…) | Оставлены только нужные |
| iperf3 на `:5201` | Слушал публично | Остановлен и disabled |
| TCP syncookies | Выключены | **Включены** |
| Congestion | — | **BBR** + `fq` |
| Буферы TCP | Дефолт | Увеличены (VPN-friendly) |
| SSH | Порт 4488, root+пароль | Порт 4488; MaxAuthTries 4; LoginGraceTime 30; без X11; empty passwords запрещены |
| fail2ban | sshd + 3x-ipl | Активны |
| unattended-upgrades | Не было / не ясно | Установлены и включены |
| nginx v1 | Без security headers | `server_tokens off` + nosniff / frame / referrer |
| Xray backends | Только `127.0.0.1` | Без изменений (правильно) |
| Cert renew | acme.sh cron + certbot timer | Работают |
| Панель `:444` | Длинный webBasePath | Ок; 2FA в панели пока **выключена** (рекомендация ниже) |

---

## 2. Открытые порты (после чистки)

| Порт | Назначение |
| --- | --- |
| 80/tcp | HTTP / ACME |
| 443/tcp | Сайт + VPN (SNI) |
| 444/tcp | Панель 3X-UI (скрытый path) |
| 2096/tcp | Подписки |
| 4488/tcp | SSH |
| 51820/udp | **WireGuard** (Keenetic / MikroTik) |
| 8447/tcp | **WG Panel** (админка WireGuard, TLS) |
| 10000/tcp | Backup Reality TCP |
| 20000/tcp | Backup Reality XHTTP |

Всё остальное входящее — **deny** (UFW default).

Xray на `10443–10447` слушает **только localhost** — с интернета не видны.

---

## 3. Оптимизация под VPN

Файл `/etc/sysctl.d/99-idivles-harden.conf`:

- `tcp_congestion_control=bbr`
- `default_qdisc=fq`
- увеличенные `rmem`/`wmem`
- `tcp_fastopen=3`
- anti-spoof: `rp_filter`, без accept_redirects / source_route
- `tcp_syncookies=1`

Xray template уже:

- access log off, dnsLog off;
- DNS DoH (1.1.1.1 / 8.8.8.8), `UseIPv4`;
- routing: block `geoip:private` + bittorrent.

---

## 4. Рекомендации админу (ещё не всё включено намеренно)

1. **2FA в панели 3X-UI** — включить (`twoFactorEnable`), сейчас false.  
2. **SSH по ключу** — завести ключ, затем `PasswordAuthentication no` (сейчас пароль ещё нужен для аварийного доступа).  
3. При желании спрятать 3X-UI за VPN/whitelist IP (`webListen` / UFW from).  
4. **WG Panel** (`:8447`) — уже с rate-limit и баном после 2 ошибок входа; пароль только в `/opt/wg-panel/admin.bootstrap` / смене на сервере ([WG-PANEL.md](./WG-PANEL.md)).  
5. Backup Reality `:10000`/`:20000` — держать только если реально нужны; иначе закрыть в UFW.  
6. Следить, чтобы деплой sochi-portal не затирал `stream.d/tyoung-sni.conf`.

---

## 5. Имена профилей в подписке (отображение)

| Имя в клиенте | Устройства | Смысл |
| --- | --- | --- |
| **ТЕЛ+ПК · TLS-WS ★** | Телефон и ПК | Рекомендуется на LTE |
| **ТЕЛ+ПК · gRPC** (`tls`) | Телефон и ПК | Запасной мобильный |
| **ТЕЛ+ПК · gRPC** (`none`) | Телефон и ПК | Старый рабочий |
| **ПК·WiFi · Stealth Reality** | ПК / Wi‑Fi | На LTE часто режут |
| **ПК·WiFi · Speed Vision** | ПК / Wi‑Fi | Скоростной Reality |
| **ПК·WiFi · Alt Samsung** | ПК / Wi‑Fi | Запасной SNI |

У первого профиля может быть суффикс `-логин` (штатно в 3X-UI — метка аккаунта).

Подпись подписки (`subAnnounce`) объясняет префиксы **ТЕЛ+ПК** / **ПК·WiFi**.
