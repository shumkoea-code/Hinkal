#!/usr/bin/env bash
###############################################################################
# websec-scan.sh — пассивный аудит безопасности веб-сайта
#
# Профессиональный неинвазивный сканер: проверяет транспорт (TLS), заголовки
# безопасности, cookies, CORS, раскрытие информации, публичные файлы,
# поведение 404/листинг каталогов и выставляет итоговую оценку.
#
# ⚠️ ЭТИКА И ЗАКОННОСТЬ:
#   Скрипт делает ТОЛЬКО безопасные запросы (GET/HEAD/OPTIONS) — то же, что
#   видит обычный браузер. Никаких атак, эксплуатации, брутфорса, фаззинга или
#   нагрузки. Запускайте только против сайтов, которыми владеете, или с
#   письменного разрешения владельца.
#
# Использование:
#   bash tools/websec-scan.sh https://example.com
#   bash tools/websec-scan.sh                 # спросит URL интерактивно
#   bash tools/websec-scan.sh -o report.md https://example.com
#   bash tools/websec-scan.sh --no-color --skip-files https://example.com
#
# Опции:
#   -o, --output <файл>   куда сохранить Markdown-отчёт
#                         (по умолчанию reports/<host>-<дата>.md)
#       --skip-files      не проверять типовые «утекшие» файлы (.git, .env, ...)
#       --no-color        отключить цвет в консоли
#       --timeout <сек>   таймаут на запрос (по умолчанию 20)
#   -h, --help            справка
#
# Зависимости: bash, curl, openssl (для TLS-проверок), grep, sed, awk.
###############################################################################
set -u

# ------------------------------ параметры ------------------------------------
TARGET=""
OUTPUT=""
SKIP_FILES=0
TIMEOUT=20
USE_COLOR=1

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output)  OUTPUT="${2:-}"; shift 2 ;;
    --skip-files) SKIP_FILES=1; shift ;;
    --no-color)   USE_COLOR=0; shift ;;
    --timeout)    TIMEOUT="${2:-20}"; shift 2 ;;
    -h|--help)    usage ;;
    -* ) echo "Неизвестная опция: $1" >&2; exit 2 ;;
    *  ) TARGET="$1"; shift ;;
  esac
done

# ------------------------------ проверки среды -------------------------------
command -v curl >/dev/null 2>&1 || { echo "Требуется curl" >&2; exit 3; }
HAVE_OPENSSL=1; command -v openssl >/dev/null 2>&1 || HAVE_OPENSSL=0

# ------------------------------ цвета ----------------------------------------
if [ "$USE_COLOR" = 1 ] && [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_BLU=$'\033[34m'; C_BLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_BLD=""; C_DIM=""; C_RST=""
fi

# ------------------------------ ввод цели ------------------------------------
if [ -z "$TARGET" ]; then
  printf '%s' "Введите URL сайта для проверки (например https://example.com): "
  read -r TARGET
fi
[ -n "$TARGET" ] || { echo "URL не задан." >&2; exit 2; }

# нормализация: добавить схему, убрать хвостовой слэш
case "$TARGET" in http://*|https://*) ;; *) TARGET="https://$TARGET" ;; esac
TARGET="${TARGET%/}"
SCHEME="${TARGET%%://*}"
HOSTPORT="${TARGET#*://}"; HOSTPORT="${HOSTPORT%%/*}"
HOST="${HOSTPORT%%:*}"
PORT="${HOSTPORT##*:}"; [ "$PORT" = "$HOSTPORT" ] && PORT=""

# ------------------------------ отчёт ----------------------------------------
if [ -z "$OUTPUT" ]; then
  mkdir -p reports 2>/dev/null
  OUTPUT="reports/${HOST}-$(date +%Y%m%d-%H%M%S).md"
fi
: > "$OUTPUT" 2>/dev/null || { echo "Не могу писать в $OUTPUT" >&2; exit 4; }

# счётчики и накопитель строк таблицы
N_HIGH=0; N_MED=0; N_LOW=0; N_OK=0; N_INFO=0
declare -a ROWS=()

# add_result <severity: high|med|low|info> <status: OK|WARN|FAIL|INFO> <title> <detail>
add_result() {
  local sev="$1" st="$2" title="$3" detail="$4"
  local color label
  case "$st" in
    OK)   color="$C_GRN"; label="OK  "; N_OK=$((N_OK+1)) ;;
    WARN) color="$C_YEL"; label="WARN"; ;;
    FAIL) color="$C_RED"; label="FAIL"; ;;
    INFO) color="$C_BLU"; label="INFO"; N_INFO=$((N_INFO+1)) ;;
  esac
  if [ "$st" = "WARN" ] || [ "$st" = "FAIL" ]; then
    case "$sev" in high) N_HIGH=$((N_HIGH+1));; med) N_MED=$((N_MED+1));; low) N_LOW=$((N_LOW+1));; esac
  fi
  printf '  %s[%s]%s %-38s %s%s%s\n' "$color" "$label" "$C_RST" "$title" "$C_DIM" "$detail" "$C_RST"
  # экранируем | для markdown-таблицы
  local d_md="${detail//|/\\|}"
  ROWS+=("| $st | ${sev^^} | $title | $d_md |")
}

section() { printf '\n%s== %s ==%s\n' "$C_BLD" "$1" "$C_RST"; }

# ------------------------------ старт ----------------------------------------
printf '%s╔══════════════════════════════════════════════════════╗%s\n' "$C_BLD" "$C_RST"
printf '%s║  websec-scan — пассивный аудит безопасности сайта     ║%s\n' "$C_BLD" "$C_RST"
printf '%s╚══════════════════════════════════════════════════════╝%s\n' "$C_BLD" "$C_RST"
printf 'Цель:   %s%s%s\n' "$C_BLD" "$TARGET" "$C_RST"
printf 'Хост:   %s\n' "$HOST"
printf 'Время:  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
printf 'Отчёт:  %s\n' "$OUTPUT"

CURL=(curl -sS --max-time "$TIMEOUT" -A "websec-scan/1.0 (passive audit)")

# получить заголовки главной страницы (следуя редиректам)
HDRS_FINAL="$("${CURL[@]}" -L -D - -o /dev/null "$TARGET/" 2>/dev/null)"
if [ -z "$HDRS_FINAL" ]; then
  echo "${C_RED}Не удалось получить ответ от $TARGET${C_RST}" >&2
  add_result high FAIL "Доступность" "нет ответа от сервера"
fi
# заголовки без следования редиректу (для анализа самого первого ответа)
HDRS_RAW="$("${CURL[@]}" -D - -o /dev/null "$TARGET/" 2>/dev/null)"
HOME_HTML="$("${CURL[@]}" -L --max-time "$TIMEOUT" "$TARGET/" 2>/dev/null | head -c 200000)"

hdr() { grep -i "^$1:" <<<"$HDRS_FINAL" | head -1 | sed 's/\r//' | sed "s/^[^:]*:[[:space:]]*//"; }
has_hdr() { grep -iq "^$1:" <<<"$HDRS_FINAL"; }

# --- хэшер для сравнения тел ответов (детект SPA-fallback) -------------------
if   command -v sha1sum   >/dev/null 2>&1; then HASHCMD="sha1sum"
elif command -v md5sum    >/dev/null 2>&1; then HASHCMD="md5sum"
elif command -v shasum    >/dev/null 2>&1; then HASHCMD="shasum"
else HASHCMD="cksum"; fi
hashof() { printf '%s' "$1" | $HASHCMD | awk '{print $1}'; }

# fetch_sig <url>  → задаёт RETCODE и BODYHASH одним запросом (без -L)
RETCODE=""; BODYHASH=""
fetch_sig() {
  local out marker=$'\n__WSSIG__'
  out="$("${CURL[@]}" -w "${marker}%{http_code}" "$1" 2>/dev/null)"
  RETCODE="${out##*__WSSIG__}"
  BODYHASH="$(hashof "${out%$marker*}")"
}

# Сигнатура SPA-fallback: тело ответа на заведомо несуществующий путь.
# Если реальный файл вернёт то же тело — значит это fallback, а не файл.
FB_PROBE="/__wssig_$(date +%s)_$RANDOM"
fetch_sig "$TARGET$FB_PROBE"; FB_CODE="$RETCODE"; FB_HASH="$BODYHASH"
SPA_FALLBACK=0; [ "$FB_CODE" = "200" ] && SPA_FALLBACK=1
HOME_HASH="$(hashof "$HOME_HTML")"

# is_real_file <url> → 0 (да, реальный файл) если 200 и тело ≠ fallback/home
is_real_file() {
  fetch_sig "$1"
  [ "$RETCODE" = "200" ] || return 1
  [ "$BODYHASH" = "$FB_HASH" ] && return 1
  [ "$BODYHASH" = "$HOME_HASH" ] && return 1
  return 0
}

# ------------------------------ 1. Транспорт / TLS ---------------------------
section "1. Транспорт и TLS"

# редирект http -> https
REDIR_LOC="$("${CURL[@]}" -D - -o /dev/null "http://$HOST/" 2>/dev/null | grep -i '^location:' | head -1 | sed 's/\r//')"
if grep -iq 'https://' <<<"$REDIR_LOC"; then
  add_result med OK "Редирект HTTP→HTTPS" "$REDIR_LOC"
else
  add_result med FAIL "Редирект HTTP→HTTPS" "нет редиректа на HTTPS (${REDIR_LOC:-нет заголовка Location})"
fi

if [ "$SCHEME" = "https" ] && [ "$HAVE_OPENSSL" = 1 ]; then
  CERT="$(echo | timeout "$TIMEOUT" openssl s_client -connect "${HOST}:${PORT:-443}" -servername "$HOST" 2>/dev/null | openssl x509 -noout -issuer -subject -dates -ext subjectAltName 2>/dev/null)"
  if [ -n "$CERT" ]; then
    ISSUER="$(sed -n 's/^issuer=//p' <<<"$CERT")"
    NOTAFTER="$(sed -n 's/^notAfter=//p' <<<"$CERT")"
    add_result info INFO "TLS-сертификат: издатель" "$ISSUER"
    if [ -n "$NOTAFTER" ]; then
      EXP_EPOCH="$(date -d "$NOTAFTER" +%s 2>/dev/null)"
      NOW_EPOCH="$(date +%s)"
      if [ -n "$EXP_EPOCH" ]; then
        DAYS=$(( (EXP_EPOCH - NOW_EPOCH) / 86400 ))
        if   [ "$DAYS" -lt 0 ];  then add_result high FAIL "Срок сертификата" "ИСТЁК ($NOTAFTER)"
        elif [ "$DAYS" -lt 14 ]; then add_result med  WARN "Срок сертификата" "истекает через $DAYS дн. ($NOTAFTER)"
        else add_result low OK "Срок сертификата" "ещё $DAYS дн. ($NOTAFTER)"; fi
      fi
    fi
  else
    add_result med WARN "TLS-сертификат" "не удалось прочитать сертификат"
  fi

  # поддержка протоколов
  for proto in tls1 tls1_1 tls1_2 tls1_3; do
    if echo | timeout "$TIMEOUT" openssl s_client -connect "${HOST}:${PORT:-443}" -servername "$HOST" "-$proto" >/dev/null 2>&1; then
      case "$proto" in
        tls1)   add_result high FAIL "Протокол TLS 1.0"  "включён (устаревший, отключить)";;
        tls1_1) add_result high FAIL "Протокол TLS 1.1"  "включён (устаревший, отключить)";;
        tls1_2) add_result low  OK   "Протокол TLS 1.2"  "поддерживается";;
        tls1_3) add_result low  OK   "Протокол TLS 1.3"  "поддерживается";;
      esac
    fi
  done
elif [ "$SCHEME" != "https" ]; then
  add_result high FAIL "HTTPS" "сайт открыт по http:// — нет шифрования"
fi

# ------------------------------ 2. Заголовки безопасности --------------------
section "2. Заголовки безопасности"

# HSTS
if has_hdr "strict-transport-security"; then
  HSTS="$(hdr strict-transport-security)"
  MAXAGE="$(sed -n 's/.*max-age=\([0-9]*\).*/\1/p' <<<"$HSTS")"
  if [ -n "$MAXAGE" ] && [ "$MAXAGE" -ge 15552000 ]; then
    add_result low OK "HSTS" "$HSTS"
  else
    add_result med WARN "HSTS" "слишком малый max-age: $HSTS"
  fi
else
  add_result med FAIL "HSTS (Strict-Transport-Security)" "отсутствует"
fi

# CSP
if has_hdr "content-security-policy"; then
  CSP="$(hdr content-security-policy)"
  if grep -Eiq "unsafe-inline|unsafe-eval" <<<"$CSP"; then
    add_result med WARN "Content-Security-Policy" "есть, но содержит unsafe-inline/unsafe-eval"
  else
    add_result low OK "Content-Security-Policy" "присутствует"
  fi
else
  add_result med FAIL "Content-Security-Policy" "отсутствует"
fi

# X-Content-Type-Options
if grep -iq "^x-content-type-options:[[:space:]]*nosniff" <<<"$HDRS_FINAL"; then
  add_result low OK "X-Content-Type-Options" "nosniff"
else
  add_result low FAIL "X-Content-Type-Options" "отсутствует (нужен nosniff)"
fi

# кликджекинг: X-Frame-Options или frame-ancestors в CSP
if has_hdr "x-frame-options" || grep -iq "frame-ancestors" <<<"$(hdr content-security-policy)"; then
  add_result low OK "Защита от кликджекинга" "$(hdr x-frame-options || echo 'CSP frame-ancestors')"
else
  add_result med FAIL "Защита от кликджекинга" "нет X-Frame-Options / frame-ancestors"
fi

# Referrer-Policy
if has_hdr "referrer-policy"; then add_result low OK "Referrer-Policy" "$(hdr referrer-policy)"
else add_result low FAIL "Referrer-Policy" "отсутствует"; fi

# Permissions-Policy
if has_hdr "permissions-policy"; then add_result low OK "Permissions-Policy" "$(hdr permissions-policy)"
else add_result low FAIL "Permissions-Policy" "отсутствует"; fi

# Cross-Origin-* (доп. изоляция)
for h in cross-origin-opener-policy cross-origin-resource-policy; do
  if has_hdr "$h"; then add_result info OK "${h}" "$(hdr "$h")"
  else add_result info INFO "${h}" "не задан (опционально)"; fi
done

# ------------------------------ 3. Раскрытие информации ----------------------
section "3. Раскрытие информации"

SRV="$(hdr server)"
if [ -z "$SRV" ]; then
  add_result low OK "Заголовок Server" "не выдаётся"
elif grep -Eq '[0-9]+\.[0-9]+' <<<"$SRV"; then
  add_result low WARN "Заголовок Server" "раскрывает версию: $SRV"
else
  add_result low OK "Заголовок Server" "$SRV (без версии)"
fi

for h in x-powered-by x-aspnet-version x-aspnetmvc-version x-generator; do
  if has_hdr "$h"; then add_result low WARN "Заголовок ${h}" "раскрывает стек: $(hdr "$h")"; fi
done

# ------------------------------ 4. Cookies -----------------------------------
section "4. Cookies"
COOKIES="$(grep -i '^set-cookie:' <<<"$HDRS_FINAL" | sed 's/\r//')"
if [ -z "$COOKIES" ]; then
  add_result info INFO "Set-Cookie" "куки не устанавливаются на главной"
else
  while IFS= read -r ck; do
    name="$(sed -n 's/^[Ss]et-[Cc]ookie:[[:space:]]*\([^=]*\)=.*/\1/p' <<<"$ck")"
    miss=""
    grep -iq "secure"    <<<"$ck" || miss="$miss Secure"
    grep -iq "httponly"  <<<"$ck" || miss="$miss HttpOnly"
    grep -iq "samesite"  <<<"$ck" || miss="$miss SameSite"
    if [ -n "$miss" ]; then add_result med WARN "Cookie '$name'" "нет флагов:$miss"
    else add_result low OK "Cookie '$name'" "Secure+HttpOnly+SameSite"; fi
  done <<<"$COOKIES"
fi

# ------------------------------ 5. CORS --------------------------------------
section "5. CORS"
ACAO="$("${CURL[@]}" -D - -o /dev/null -H "Origin: https://evil.example" "$TARGET/" 2>/dev/null | grep -i '^access-control-allow-origin:' | head -1 | sed 's/\r//' | sed 's/^[^:]*:[[:space:]]*//')"
if [ -z "$ACAO" ]; then
  add_result info OK "CORS" "Access-Control-Allow-Origin не выставляется"
elif [ "$ACAO" = "*" ]; then
  add_result med WARN "CORS" "Access-Control-Allow-Origin: * (открыт для всех)"
elif grep -iq "evil.example" <<<"$ACAO"; then
  add_result high WARN "CORS" "отражает произвольный Origin ($ACAO) — небезопасно"
else
  add_result low OK "CORS" "ограничен: $ACAO"
fi

# ------------------------------ 6. HTTP-методы -------------------------------
section "6. HTTP-методы"
ALLOW="$("${CURL[@]}" -X OPTIONS -D - -o /dev/null "$TARGET/" 2>/dev/null | grep -i '^allow:' | head -1 | sed 's/\r//' | sed 's/^[^:]*:[[:space:]]*//')"
[ -n "$ALLOW" ] && add_result info INFO "Allow (OPTIONS)" "$ALLOW"
TRACE_CODE="$("${CURL[@]}" -X TRACE -o /dev/null -w '%{http_code}' "$TARGET/" 2>/dev/null)"
if [ "$TRACE_CODE" = "200" ]; then add_result med WARN "Метод TRACE" "включён (риск Cross-Site Tracing)"
else add_result low OK "Метод TRACE" "отключён (код $TRACE_CODE)"; fi

# ------------------------------ 7. Публичные файлы ---------------------------
section "7. Публичные файлы"
[ "$SPA_FALLBACK" = 1 ] && add_result info INFO "SPA-fallback" "неизвестные пути отдают index.html (200) — учтено при проверках"
check_public() { # <path> <имя>
  if is_real_file "$TARGET$1"; then add_result info OK "$2" "присутствует ($1)"
  elif [ "$SPA_FALLBACK" = 1 ] && [ "$RETCODE" = "200" ]; then add_result info INFO "$2" "нет ($1 → SPA-fallback 200)"
  else add_result info INFO "$2" "нет ($1 → $RETCODE)"; fi
}
check_public "/robots.txt"  "robots.txt"
check_public "/sitemap.xml" "sitemap.xml"
if is_real_file "$TARGET/.well-known/security.txt"; then add_result low OK "security.txt" "присутствует (реальный файл)"
else add_result low WARN "security.txt" "нет реального файла (канал для сообщений об уязвимостях, RFC 9116)"; fi

# ------------------------------ 8. 404 / листинг каталогов -------------------
section "8. Обработка ошибок и листинг"
RAND="notexist-$RANDOM$RANDOM"
NF_CODE="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$TARGET/$RAND" 2>/dev/null)"
NF_TYPE="$("${CURL[@]}" -D - -o /dev/null "$TARGET/$RAND" 2>/dev/null | grep -i '^content-type:' | head -1 | sed 's/\r//')"
if [ "$NF_CODE" = "404" ]; then
  add_result low OK "Несуществующий путь" "→ 404"
elif [ "$NF_CODE" = "200" ]; then
  add_result low WARN "Несуществующий путь" "→ 200 (вероятно SPA-fallback; неизвестные пути должны давать 404)"
else
  add_result info INFO "Несуществующий путь" "→ $NF_CODE"
fi
# листинг каталога (autoindex)
if grep -qi "Index of /" <<<"$("${CURL[@]}" -L "$TARGET/assets/" 2>/dev/null | head -c 4000)"; then
  add_result med FAIL "Листинг каталогов" "autoindex включён (виден список файлов)"
else
  add_result low OK "Листинг каталогов" "не обнаружен"
fi

# ------------------------------ 9. «Утекшие» файлы (GET-статусы) -------------
if [ "$SKIP_FILES" = 0 ]; then
  section "9. Проверка типовых утечек (только коды ответа)"
  LEAKS=("/.git/config" "/.env" "/.env.local" "/.env.production" "/config.php" \
         "/wp-config.php" "/.htaccess" "/server-status" "/phpinfo.php" \
         "/.DS_Store" "/backup.zip" "/backup.sql" "/dump.sql" "/.svn/entries")
  FOUND=0
  for p in "${LEAKS[@]}"; do
    # реальный файл = 200 И тело отличается от SPA-fallback/главной
    if is_real_file "$TARGET$p"; then add_result high FAIL "Открытый файл $p" "доступен реальный файл (HTTP 200)"; FOUND=1; fi
  done
  if [ "$FOUND" = 0 ]; then
    if [ "$SPA_FALLBACK" = 1 ]; then
      add_result low OK "Типовые утечки" "не найдены (${#LEAKS[@]} путей; 200-ответы — это SPA-fallback, не файлы)"
    else
      add_result low OK "Типовые утечки" "ни один из ${#LEAKS[@]} путей не отдал реальный файл"
    fi
  fi
fi

# ------------------------------ 10. Mixed content ----------------------------
section "10. Смешанный контент (HTML главной)"
if [ "$SCHEME" = "https" ]; then
  MIXED="$(grep -oiE '(src|href)="http://[^"]+"' <<<"$HOME_HTML" | head -5)"
  if [ -n "$MIXED" ]; then
    add_result med WARN "Mixed content" "есть ссылки на http:// ресурсы в HTML"
  else
    add_result low OK "Mixed content" "явных http:// ресурсов в HTML не найдено"
  fi
fi

# ------------------------------ ИТОГ / оценка --------------------------------
SCORE=$((100 - N_HIGH*15 - N_MED*7 - N_LOW*2))
[ "$SCORE" -lt 0 ] && SCORE=0
if   [ "$SCORE" -ge 90 ]; then GRADE="A"; GC="$C_GRN"
elif [ "$SCORE" -ge 80 ]; then GRADE="B"; GC="$C_GRN"
elif [ "$SCORE" -ge 65 ]; then GRADE="C"; GC="$C_YEL"
elif [ "$SCORE" -ge 50 ]; then GRADE="D"; GC="$C_YEL"
else GRADE="F"; GC="$C_RED"; fi

section "ИТОГ"
printf '  Проблемы:  %sвысокие: %d%s  |  %sсредние: %d%s  |  %sнизкие: %d%s\n' \
  "$C_RED" "$N_HIGH" "$C_RST" "$C_YEL" "$N_MED" "$C_RST" "$C_DIM" "$N_LOW" "$C_RST"
printf '  Оценка:    %s%s%s  (%d/100)\n' "$GC$C_BLD" "$GRADE" "$C_RST" "$SCORE"
printf '  Отчёт:     %s\n' "$OUTPUT"

# ------------------------------ Markdown-отчёт -------------------------------
{
  echo "# Отчёт по безопасности — $HOST"
  echo
  echo "- **Цель:** $TARGET"
  echo "- **Дата:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "- **Метод:** пассивный неинвазивный аудит (только GET/HEAD/OPTIONS)"
  echo "- **Инструмент:** websec-scan.sh"
  echo
  echo "## Итоговая оценка: $GRADE ($SCORE/100)"
  echo
  echo "| Уровень | Кол-во проблем |"
  echo "|---------|----------------|"
  echo "| Высокие | $N_HIGH |"
  echo "| Средние | $N_MED |"
  echo "| Низкие  | $N_LOW |"
  echo
  echo "## Подробные результаты"
  echo
  echo "| Статус | Уровень | Проверка | Детали |"
  echo "|--------|---------|----------|--------|"
  for r in "${ROWS[@]}"; do echo "$r"; done
  echo
  echo "## Легенда"
  echo
  echo "- **FAIL** — проблема, которую нужно исправить."
  echo "- **WARN** — потенциальная проблема / требует внимания."
  echo "- **OK** — проверка пройдена."
  echo "- **INFO** — информационная запись."
  echo
  echo "> ⚠️ Аудит пассивный: проверялась только видимая снаружи поверхность."
  echo "> Backend/API и обработка персональных данных требуют отдельной"
  echo "> авторизованной проверки на тестовом стенде."
} > "$OUTPUT"

exit 0
