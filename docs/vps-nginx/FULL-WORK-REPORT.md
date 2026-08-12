# Полный отчёт о проделанной работе

**Объект:** VPS `v1.idivles.ru` / `77.110.125.241`  
**Стек:** Debian 12, nginx 1.22.1, 3X-UI 3.6.0, Xray 26.7.28, Docker (sochi-portal)  
**Период работ:** 12 августа 2026  
**Исполнитель:** Cursor Cloud Agent  

> Пароли и секреты в этот документ **не включены**.

---

## 0. Цель работ

1. Понять, почему «не работает порт 10443 / VPN».
2. Совместить **сайт на 443** и **VPN на 443**.
3. Прокачать 3X-UI/Xray: сделать быстрее, скрытнее, на актуальных технологиях.
4. Всё задокументировать с пояснениями.

---

## 1. Исходная проблема (диагностика)

### 1.1. Симптомы

- Клиенты с портом **10443** не подключались (TCP RST).
- `https://v1.idivles.ru/` в браузере ломался (`wrong version number`).
- При этом сайт **https://tyoung.idivles.ru/** открывался нормально.
- На панели inbound «Telegram» был enable, Xray running, трафик исторически большой (~175 ГБ).

### 1.2. Корневая причина

На `:443` уже стоял **nginx stream SNI-мультиплексор** (`ssl_preread`), а не обычный HTTP-сайт «в лоб»:

```text
SNI tyoung.idivles.ru  → 127.0.0.1:8443  (HTTPS портал Next.js)
default / без TLS      → 127.0.0.1:10443 (Xray VLESS+gRPC security=none)
```

Xray inbound слушал **только** `127.0.0.1:10443`.  
Публичная точка входа — **443**. В подписке же фигурировал порт **10443** → клиенты били мимо входа.

gRPC без TLS на default-SNI при этом работал (проверено официальным Xray-клиентом на `:443`).

Подробный журнал первичной диагностики: [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md).

---

## 2. Этап A — восстановление сосуществования сайта и VPN

### Сделано

1. **3X-UI Host** `nginx-grpc-443`: адрес `v1.idivles.ru`, порт **443**, `security=none`.
2. В stream-карту добавлен `v1.idivles.ru` → `127.0.0.1:8445` (маскировочная HTTPS-страница + `location /gun`).
3. Открыты в UFW порты запасных inbound’ов `10000/20000/30001`.
4. Проверены сайт tyoung, маска v1, VPN gRPC на 443.

### Результат этапа A

| Проверка | Итог |
| --- | --- |
| tyoung.idivles.ru | 200 |
| v1.idivles.ru | 200 (маска) |
| VLESS gRPC `:443` | OK |
| Reality TCP/XHTTP backup | OK после открытия UFW |

---

## 3. Этап B — стелс-апгрейд (лучшие практики 2026)

### 3.1. Почему меняли основной транспорт

| Было | Минусы |
| --- | --- |
| VLESS + **gRPC** + `security=none` | gRPC в Xray **deprecated**; без TLS/REALITY хорошо детектится DPI; `authority=max.ru` + PQ mlkem — тяжёлый и специфичный отпечаток |

| Стало (основное) | Плюсы |
| --- | --- |
| VLESS + **XHTTP** + **REALITY** на `:443` | Актуальный транспорт; TLS-подобный хендшейк под Cloudflare; тот же порт, что у сайта; быстрее/устойчивее на сетях с DPI |

### 3.2. Что внедрено

#### Новый основной inbound

| Поле | Значение |
| --- | --- |
| id | **15** |
| remark | `Stealth-Reality-XHTTP` |
| listen | `127.0.0.1:10444` |
| protocol | vless |
| network | **xhttp** (mode auto) |
| security | **reality** |
| target | `www.cloudflare.com:443` |
| serverNames | cloudflare + apple |
| fingerprint | chrome |
| clients | **все 33** скопированы с legacy inbound #1 (те же UUID) |

#### Host для подписки

- remark: `stealth-reality-443`
- address: `v1.idivles.ru`
- port: **443**
- security: **reality**
- sni: `www.cloudflare.com`
- fingerprint: `chrome`
- Порядок в sub: Stealth → Speed → Alt → Legacy (`sub_sort_index`).

#### nginx stream (актуально)

```nginx
map $ssl_preread_server_name $yp_backend {
    tyoung.idivles.ru   127.0.0.1:8443;   # сайт
    v1.idivles.ru       127.0.0.1:8445;   # маска
    www.cloudflare.com  127.0.0.1:10444;  # STEALTH Reality+XHTTP
    cloudflare.com      127.0.0.1:10444;
    www.apple.com       127.0.0.1:10445;  # SPEED Reality+TCP+Vision
    apple.com           127.0.0.1:10445;
    gateway.icloud.com  127.0.0.1:10445;
    www.icloud.com      127.0.0.1:10445;
    www.samsung.com     127.0.0.1:10446;  # ALT Reality+XHTTP
    samsung.com         127.0.0.1:10446;
    default             127.0.0.1:10443;  # LEGACY gRPC
}
```

Клиент Reality подключается к IP `v1.idivles.ru:443`, но в TLS ClientHello ставит нужный SNI → stream отдаёт на соответствующий inbound.

#### Этап C — отдельные профили Speed и Alt

| id | Remark | listen | Транспорт | Reality dest / SNI | Зачем |
| --- | --- | --- | --- | --- | --- |
| 16 | `Speed-Reality-TCP-Vision` | `127.0.0.1:10445` | TCP + Vision | `www.apple.com` | отдельный «быстрый» канал |
| 17 | `Alt-Reality-XHTTP-Samsung` | `127.0.0.1:10446` | XHTTP | `www.samsung.com` | отдельный SNI, если режут CF/Apple |

`www.microsoft.com` как Reality-target с этой VPS давал EOF — заменён на Samsung после бенчмарка dest’ов.

Порядок в подписке: `sub_sort_index` 10→Stealth, 20→Speed, 30→Alt, 90→Legacy.

#### Прочие изменения inbound’ов

| id | Статус | Remark |
| --- | --- | --- |
| 1 | enable, legacy | `LEGACY-gRPC-none` |
| 11 | **удалён** | битый Reality router |
| 12 | enable, backup | `BACKUP-Reality-TCP-10000` |
| 13 | enable, backup | `BACKUP-Reality-XHTTP-20000` |
| 14 | **удалён** | WS+TLS |
| 15 | enable, **main** | `Stealth-Reality-XHTTP` |
| 16 | enable, speed | `Speed-Reality-TCP-Vision` |
| 17 | enable, alt | `Alt-Reality-XHTTP-Samsung` |

#### Xray template (DNS / routing / logs)

Обновлён `xrayTemplateConfig` в `/etc/x-ui/x-ui.db`:

- DNS: DoH `1.1.1.1` / `8.8.8.8`, `queryStrategy=UseIPv4`
- routing: `domainStrategy=IPIfNonMatch`, block private + bittorrent
- log: `access=none`, `dnsLog=false` (меньше следов на диске)

#### Firewall

- Удалён публичный allow на **10443** (backend только localhost).
- Оставлены 443/80/444/2096/4488 + backup Reality ports.

### 3.3. Живая верификация (12.08.2026, повтор)

| Проверка | Результат |
| --- | --- |
| Stealth Reality+XHTTP `:443` (SNI Cloudflare) | **OK** → egress `ip=77.110.125.241` |
| Speed Reality+TCP+Vision `:443` (SNI Apple) | **OK** |
| Alt Reality+XHTTP `:443` (SNI Samsung) | **OK** |
| Legacy gRPC `:443` (с PQ `encryption=` из sub) | **OK** |
| Backup Reality TCP `:10000` / XHTTP `:20000` | **OK** (test-клиенты) |
| Подписка `/sub/pepewtfa/<subId>` порядок | Stealth → Speed → Alt → Legacy |
| JSON sub / Clash | 200 |
| https://tyoung.idivles.ru/ | 200 |
| https://v1.idivles.ru/ | 200 |
| Панель `:444` | 200 |
| Xray | running 26.7.28 |

Замечание: legacy-линк в sub несёт длинный `encryption=mlkem768…` — клиент без PQ на gRPC не поднимется; Reality-профили используют обычный `encryption=none`.

---

## 4. Итоговая архитектура

```text
                     Интернет :443
                           │
                 nginx stream + ssl_preread
                           │
     ┌────────┬────────┬──────────┬──────────┬──────────┐
     │        │        │          │          │          │
  SNI tyoung SNI v1  SNI CF   SNI Apple  SNI Samsung  default
     │        │        │          │          │          │
     ▼        ▼        ▼          ▼          ▼          ▼
  :8443    :8445    :10444     :10445     :10446     :10443
  сайт     маска   STEALTH    SPEED      ALT        LEGACY
  Next.js  +/gun   XHTTP      TCP+Vision XHTTP      gRPC
                   Reality    Reality    Reality    none
```

---

## 5. Файлы на сервере (изменённые / важные)

| Путь | Что |
| --- | --- |
| `/etc/nginx/stream.d/tyoung-sni.conf` | SNI-роутер (stealth edition) |
| `/etc/nginx/stream.d/tyoung-sni.conf.bak*` | бэкапы |
| `/etc/nginx/sites-available/v1-idivles-ssl` | маска v1 + `/gun` |
| `/var/www/v1.idivles.ru/index.html` | маскировочная страница |
| `/etc/x-ui/x-ui.db` | inbounds/hosts/template |
| `/usr/local/x-ui/bin/config.json` | живой конфиг Xray |

Копии конфигов в репозитории: [live/](./live/).

---

## 6. Документация в репозитории

| Документ | Для кого | Ссылка |
| --- | --- | --- |
| **Инструкция пользователям** | клиенты / админ «как подключить» | [USER-GUIDE.md](./USER-GUIDE.md) |
| **Этот полный отчёт** | заказчик / админ | [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md) |
| **Первичная диагностика** | техдетали этапа A | [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md) |
| **Оглавление папки** | навигация | [README.md](./README.md) |
| Сырые логи SSH/тестов | аудит | [logs/](./logs/) |

Публичный путь в GitHub (ветка PR):

https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx

Прямые ссылки:

- Инструкция: https://github.com/shumkoea-code/Hinkal/blob/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx/USER-GUIDE.md  
- Полный отчёт: https://github.com/shumkoea-code/Hinkal/blob/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx/FULL-WORK-REPORT.md  

---

## 7. Рекомендации дальше

1. Когда все обновят подписку — отключить Host/inbound **LEGACY**.
2. Деплой sochi-portal **не должен затирать** `stream.d/tyoung-sni.conf` (CF→10444, Apple→10445, Samsung→10446).
3. Backup на `10000`/`20000` — только запас.
4. Обновлять Xray/3X-UI; клиентам минимум **v26.3.27**.
5. Не светить UUID/pbk/shortId в открытых чатах.
6. Если понадобится ещё один отдельный канал — брать Reality-dest с низким TLS RTT с этой VPS (не Microsoft: здесь давал EOF).

---

## 8. Краткий checklist приёмки

- [x] Сайт tyoung на 443 работает  
- [x] Маска v1 на 443 работает  
- [x] Stealth Reality+XHTTP на 443  
- [x] Speed Reality+TCP+Vision на 443 (отдельный)  
- [x] Alt Reality+XHTTP Samsung на 443 (отдельный)  
- [x] Legacy gRPC на 443  
- [x] Подписка: 4 линка в правильном порядке  
- [x] Backup TCP/XHTTP  
- [x] 10443 не публичный в UFW  
- [x] Документация обновлена  

**Итог:** сайт и VPN на одном 443; три актуальных Reality-профиля + legacy; все ссылки и варианты подключения проверены live.
