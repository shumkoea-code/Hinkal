#!/usr/bin/env bash
# Пассивная проверка заголовков безопасности и базовой конфигурации.
# Только неинвазивные GET/HEAD-запросы — безопасно для своего сайта.
#
# Использование:  bash tools/check-headers.sh https://hinkalnayaureki.ru
set -u

BASE="${1:-https://hinkalnayaureki.ru}"
BASE="${BASE%/}"
HOST="${BASE#http*://}"

pass() { printf '  [ OK ] %s\n' "$1"; }
warn() { printf '  [WARN] %s\n' "$1"; }

echo "== Проверка: $BASE =="
HDRS="$(curl -sS -D - -o /dev/null --max-time 20 "$BASE/" 2>/dev/null)"

check() { # <regex> <имя> <текст-если-нет>
  if grep -iq "$1" <<<"$HDRS"; then pass "$2 присутствует"; else warn "$3"; fi
}

echo "-- Заголовки безопасности --"
check '^strict-transport-security:'  'HSTS'                 'нет HSTS (F-1) → R-1'
check '^content-security-policy'     'CSP'                  'нет Content-Security-Policy (F-2) → R-2'
check '^x-content-type-options:'     'X-Content-Type-Options' 'нет X-Content-Type-Options (F-3) → R-3'
check '^\(x-frame-options\|content-security-policy.*frame-ancestors\)' 'защита от кликджекинга' 'нет X-Frame-Options/frame-ancestors (F-4) → R-3'
check '^referrer-policy:'            'Referrer-Policy'      'нет Referrer-Policy (F-5) → R-3'
check '^permissions-policy:'         'Permissions-Policy'   'нет Permissions-Policy (F-5) → R-3'

echo "-- Раскрытие информации --"
SRV="$(grep -i '^server:' <<<"$HDRS" | tr -d '\r')"
if grep -Eiq '^server:\s*nginx($|\s*$)' <<<"$SRV"; then
  pass "Server не раскрывает версию ($SRV)"
else
  warn "Server раскрывает детали: '${SRV:-нет заголовка}' (F-6) → R-4 (server_tokens off)"
fi

echo "-- Редирект http → https --"
LOC="$(curl -sS -D - -o /dev/null --max-time 20 "http://$HOST/" 2>/dev/null | grep -i '^location:' | tr -d '\r')"
if grep -iq 'location:\s*https://' <<<"$LOC"; then pass "80 → 443 ($LOC)"; else warn "нет редиректа на HTTPS"; fi

echo "-- 404 для несуществующего пути --"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/this-path-should-not-exist-$RANDOM")"
if [ "$CODE" = "404" ]; then pass "несуществующий путь → 404"; else warn "несуществующий путь → $CODE (ожидался 404) (F-8) → R-6"; fi

echo "== Готово =="
