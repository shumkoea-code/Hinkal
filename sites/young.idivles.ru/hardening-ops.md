# young.idivles.ru — доведение до 100/100, безопасность VPS, отказоустойчивость и нагрузка

Дата: 2026‑08‑09. VPS 176.124.204.53 (Debian 12, SSH порт 4488). Все изменения — с бэкапом и проверкой.

---

## 1. Оценка сайта: A (100/100)

Было A (91). Закрыты два оставшихся пункта:

### security.txt (Y‑5)
Отдаётся nginx как реальный файл `/.well-known/security.txt` (RFC 9116), контакт `info@young.idivles.ru`
и страница `/contacts`. Файл: `/etc/nginx/well-known/security.txt`, location в конфиге сайта.

### Строгий CSP для скриптов (Y‑1)
Убраны `'unsafe-inline'` и `'unsafe-eval'` из `script-src` — теперь per‑request **nonce + `strict-dynamic`**.
`style-src 'unsafe-inline'` оставлен намеренно (приложение рендерит инлайновые `<style>` — иначе сломается вёрстка;
это стандартная и низкорисковая практика).

Реализация — в `src/proxy.ts` (Next.js 16 использует `proxy.ts`, не `middleware.ts`): на каждый запрос
генерируется nonce, ставится в заголовки запроса (Next автоматически проставляет `nonce` во все свои `<script>`)
и в заголовок ответа `Content-Security-Policy`. Статический CSP убран из `next.config.ts`.

Ключевой фрагмент:
```ts
const nonce = btoa(crypto.randomUUID());
const csp = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru https://yandex.ru https://*.yandex.ru https:`,
  "style-src 'self' 'unsafe-inline'",
  // img/font/connect/media/frame-src ... frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
].join('; ');
requestHeaders.set('x-nonce', nonce);
requestHeaders.set('Content-Security-Policy', csp);   // Next читает nonce отсюда
res.headers.set('Content-Security-Policy', csp);       // браузер применяет
```

**Проверка:** пересобрали Docker‑образ (`docker-compose build web`, есть 2 ГБ swap — OOM не случился),
задеплоили (`docker-compose up -d web`), контейнер стал `healthy`. Заголовок теперь:
`script-src 'self' 'nonce-…' 'strict-dynamic' …` (без unsafe‑*), у скриптов есть `nonce`.
**Браузерная проверка** (главная, /contacts, /p/about, /login, выпадающие меню): всё работает,
**ошибок CSP в консоли нет**.

**Откат** (если понадобится): образ до изменений сохранён как `sochi-portal_web:pre-csp`; бэкап
`next.config.ts`/`proxy.ts` — в `/root/backups/sochi-portal/csp-2026-08-09_090329/`.
```bash
cd /opt/sochi-portal
cp /root/backups/sochi-portal/csp-2026-08-09_090329/proxy.ts.bak src/proxy.ts
cp /root/backups/sochi-portal/csp-2026-08-09_090329/next.config.ts.bak next.config.ts
docker tag sochi-portal_web:pre-csp sochi-portal_web:latest && docker-compose up -d web
```

---

## 2. Безопасность VPS (аудит + правки)

Скрипт аудита: [`../../tools/vps-audit.sh`](../../tools/vps-audit.sh) (read‑only, настраиваемый).
Отчёт: [`../../reports/vps-audit-idivles-vps.md`](../../reports/vps-audit-idivles-vps.md).
Оценка F (29→43 после безопасных правок; остаются высокие пункты, требующие решения владельца).

### Применено (безопасно, обратимо):
- Секретные бэкапы `.env` были **world‑writable** → права `600`, каталог `/root/backups` → `700`.
- `net.ipv4.tcp_syncookies=1` (защита от SYN‑flood) — persistent в `/etc/sysctl.d/99-audit-hardening.conf`.
- Установлен и включён **`unattended-upgrades`** (авто‑патчи безопасности) + `20auto-upgrades`.

### Рекомендации (НЕ применял — риск блокировки/простоя, нужно ваше решение):
- **HIGH: 12 security‑обновлений ожидают.** Применить в окне обслуживания:
  `apt-get update && apt-get upgrade` (возможен рестарт сервисов / перезагрузка).
- **HIGH: `PermitRootLogin yes` + парольный SSH.** Настроить вход по ключу и затем
  `PermitRootLogin prohibit-password`, `PasswordAuthentication no` — **только после** добавления
  вашего SSH‑ключа, иначе потеря доступа. Готов помочь, когда добавите ключ.
- **HIGH: сертификат `shumko.tech` истёк** (07.07.2026). Проверить `certbot renew` / DNS для этого домена.
- 9 портов слушают публично (x‑ui/xray 2096/444/8443, iperf3 5201, DNS‑over‑TLS 853). Проверить необходимость,
  лишнее закрыть в `ufw`. iperf3 (5201) в проде обычно не нужен.
- SSH‑порт 4488 (нестандартный — хорошо), ufw активен, fail2ban работает.

---

## 3. Отказоустойчивость и оповещение админов

Цель — сайт не падает и админ узнаёт о проблемах.

### Уже есть / включили:
- Контейнеры: `restart: always` (авто‑перезапуск при краше) + healthcheck в compose.
- Swap 2 ГБ (снижает риск OOM при пиках/сборке).

### Добавлен watchdog: [`../../tools/yp-watchdog.sh`](../../tools/yp-watchdog.sh)
Ставится как **systemd‑таймер каждые 2 минуты** (`yp-watchdog.timer`). Проверяет:
- статус и `health` контейнеров web/db/redis; при падении/`unhealthy` — **авто‑перезапуск**
  (`docker-compose up -d` + `docker restart`);
- HTTP `GET /api/health` == 200;
- диск (порог 90%) и свободную память (порог 120 МБ).

При сбое — **оповещение админов** с антиспамом (cooldown) и сообщением о восстановлении.
Каналы настраиваются в `/etc/yp-watchdog.conf`:
```
ALERT_TG_TOKEN="<токен Telegram-бота>"   # от @BotFather
ALERT_TG_CHAT="<chat id>"
ALERT_EMAIL="<email>"                     # нужен рабочий 'mail'
```
> Сейчас каналы пустые → события пишутся в `/var/log/yp-watchdog.log`, авто‑перезапуск работает.
> Чтобы получать уведомления в Telegram — заполните токен и chat id (см. §5).

Лог: `/var/log/yp-watchdog.log`. Статус: `systemctl list-timers yp-watchdog.timer`.

---

## 4. Нагрузка и вместимость (сколько активных пользователей)

**Узкое место — 1 ядро CPU** (RAM/БД/Redis почти не нагружены). Замер (ограниченный, на проде, в тихое время):

| Сценарий | Потолок | Задержка |
|----------|---------|----------|
| `/api/health` (лёгкий динамический) | **~57 req/s** | c10 avg 160 мс, c30 avg 460 мс |
| Главная (полный SSR, без кэша) | **~10 req/s** | c8 avg 0.79 с, max 1.34 с |

**Оценка одновременно активных пользователей.** При обычном браузинге (действие раз в ~10–15 с):
- Комфортно (задержки < ~0.5 с, CPU с запасом): **~80–120 одновременно активных**.
- Практический потолок до заметной деградации: **~150**, дальше растут задержки и включаются
  per‑IP лимиты nginx (`limit_conn 40`, `limit_req`).
- Зарегистрированных/«за день» пользователей может быть кратно больше — одновременно активна лишь часть.

Оговорка: замер ограниченный (не стресс до отказа, чтобы не мешать реальным пользователям).
Точный потолок лучше мерить на копии-стенде.

### Как поднять вместимость и чтобы не падал (по убыванию эффекта):
1. **Больше CPU** (2–4 vCPU) — прямой ×2–4 к SSR. Сейчас на 1 ядре ещё и соседи (x‑ui/xray, rtb, netdata,
   xvideos, iperf3) — вынести лишнее/апгрейд ядра даст максимум.
2. **Кэширование публичного HTML.** Главная отдаётся `no-store` (SSR на каждый заход). Для анонимных GET
   включить микрокэш в nginx (`proxy_cache`, 5–30 с, bypass при cookie сессии) или Next ISR/`revalidate`
   для публичных страниц — это кратно поднимет потолок для основной (анонимной) аудитории.
3. **CDN** (напр. Cloudflare) перед сайтом для статики и кэша HTML — разгрузит origin.
4. Уже есть per‑IP лимиты (`limit_req`/`limit_conn`) — защита от одиночного флуда; watchdog + `restart: always`
   поднимут сервис при сбое; swap снижает OOM.
5. Ограничить память контейнеров (`mem_limit`), чтобы один сервис не ронял соседей.

---

## 5. Что нужно от владельца (чтобы включить/докрутить)
- Для Telegram‑алертов: создать бота у @BotFather, узнать chat id, вписать в `/etc/yp-watchdog.conf`.
- Для отключения парольного SSH: прислать/добавить SSH‑публичный ключ.
- Разрешение на применение security‑обновлений в окне обслуживания и на апгрейд CPU/кэширование.
