# 04. Рекомендации и исправления

Готовый конфиг, реализующий пункты R‑1…R‑7, лежит в
[`../fixes/nginx/hinkalnayaureki.conf`](../fixes/nginx/hinkalnayaureki.conf).
Ниже — что и зачем менять.

> **Порядок внедрения.** CSP лучше выкатывать поэтапно: сначала в режиме
> `Content-Security-Policy-Report-Only` (только логирует нарушения, ничего не блокирует),
> убедиться, что сайт работает, и только потом переключать на боевой `Content-Security-Policy`.

---

## R‑1. HSTS
Добавить заголовок только на HTTPS‑сервере (никогда — на HTTP):
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```
`preload` добавлять только осознанно (после этого откат к HTTP очень болезненный).
Закрывает: **F‑1**.

## R‑2. CSP
Начать с строгого варианта и режима отчёта. Черновой строгий CSP под текущий сайт
(self + Google Fonts):
```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
img-src 'self' data:;
font-src 'self' https://fonts.gstatic.com;
style-src 'self' https://fonts.googleapis.com;
script-src 'self';
connect-src 'self';
form-action 'self';
upgrade-insecure-requests;
```
Нюансы:
- React часто задаёт инлайновые стили через атрибут `style=...`. Если после включения
  строгого CSP «поедет» вёрстка — временно добавьте `'unsafe-inline'` в `style-src`
  (или, лучше, `style-src-attr 'unsafe-inline'`) и запланируйте вынос стилей.
- `connect-src` нужно расширить доменом API онлайн‑заказа, если он на отдельном хосте.
- Проверять удобно на [csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com/).

Закрывает: **F‑2** (и `frame-ancestors` закрывает **F‑4**).

## R‑3. Прочие заголовки
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;            # для старых браузеров, дублирует frame-ancestors
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
```
Закрывает: **F‑3, F‑4, F‑5**.

## R‑4. Скрыть версию сервера
В блок `http {}` (обычно `/etc/nginx/nginx.conf`):
```nginx
server_tokens off;
```
Тогда вместо `nginx/1.18.0 (Ubuntu)` будет просто `nginx`.
Закрывает: **F‑6**.

## R‑5. Обновление и патчи
- Обновить nginx до актуальной поддерживаемой версии и настроить регулярные
  обновления ОС (`unattended-upgrades` на Ubuntu).
- Держать под контролем срок TLS‑сертификата (у Let's Encrypt — автопродление `certbot`).
Закрывает: **F‑7**.

## R‑6. Корректный 404 и fallback
SPA‑fallback нужен для клиентских маршрутов, но статику и «файловые» пути стоит отделить,
чтобы неизвестные ассеты давали честный `404`, а не `200 index.html`:
```nginx
# ассеты — только реально существующие файлы, иначе 404
location /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
# SPA‑маршруты — fallback на index.html
location / {
    try_files $uri /index.html;
}
```
Закрывает: **F‑8** (и попутно добавляет иммутабельное кэширование хешированных ассетов).

## R‑7. security.txt
Положить реальный файл по пути `/.well-known/security.txt`
(шаблон: [`../fixes/well-known/security.txt`](../fixes/well-known/security.txt)) и отдавать
его как статику. Закрывает: **F‑9**.

## R‑11. CORS: белый список
Не отражать произвольный `Origin`. Разрешать только доверенные источники (свой домен).
Пример для nginx перед backend:
```nginx
# отдавать ACAO только для своего origin, иначе не выставлять заголовок
map $http_origin $cors_ok {
    default "";
    "https://hinkalnayaureki.ru" $http_origin;
}
location /api/ {
    add_header Access-Control-Allow-Origin $cors_ok always;
    add_header Vary Origin always;
    # Access-Control-Allow-Credentials НЕ включать без крайней необходимости
    proxy_pass http://127.0.0.1:PORT;
}
```
Если бэкенд (Express и т.п.) сам ставит CORS — настроить `origin` списком, а не отражением.
Закрывает: **F‑11**.

## R‑12. Хранение токена
Перевести сессию на `Secure; HttpOnly; SameSite=Strict/Lax` cookie (недоступна из JS),
либо, если остаётся Bearer в `localStorage`, обязательно закрыть XSS строгим CSP (R‑2),
сделать токены короткоживущими и предусмотреть их отзыв (logout/ротация).
Закрывает: **F‑12**.

## R‑13. Запрет кэширования приватных ответов
Для авторизованных/персональных ответов API добавить:
```
Cache-Control: no-store
```
На уровне бэкенда для всех `/api/*`, возвращающих данные пользователя, либо в nginx:
```nginx
location /api/ {
    add_header Cache-Control "no-store" always;
    proxy_pass http://127.0.0.1:PORT;
}
```
Закрывает: **F‑13**.

## R‑10. Backend онлайн‑заказа (организационно)
Для F‑10 нужен отдельный авторизованный аудит. Базовые требования, которые стоит проверить:
валидация и экранирование ввода, защита от CSRF, ограничение частоты запросов (rate limiting),
хранение ПДн по 152‑ФЗ, HTTPS до backend, отсутствие секретов в бандле фронтенда.
Подробный список — в [`05-checklist.md`](05-checklist.md).
