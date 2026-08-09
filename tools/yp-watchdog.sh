#!/usr/bin/env bash
###############################################################################
# yp-watchdog.sh — сторож доступности сайта + оповещение админов
#
# Проверяет здоровье контейнеров и HTTP-эндпоинта, ресурсы (диск/память),
# при сбое пытается перезапустить сервис и уведомляет админов (Telegram/email).
# Ставится как systemd-таймер (напр. каждые 2 минуты). Ничего лишнего не делает.
#
# Конфиг: /etc/yp-watchdog.conf (переопределяет значения по умолчанию).
# Все параметры — переменные окружения/конфига (см. блок defaults).
###############################################################################
set -u

CONF="${YP_WATCHDOG_CONF:-/etc/yp-watchdog.conf}"

# ---------------- defaults (переопределяются в конфиге) ----------------
HEALTH_URL="https://young.idivles.ru/api/health"
RESOLVE="young.idivles.ru:443:127.0.0.1"     # curl --resolve (обход DNS/хайрпина); пусто — не использовать
HTTP_TIMEOUT=10
CONTAINERS="sochi-portal_web_1 sochi-portal_db_1 sochi-portal_redis_1"
COMPOSE_DIR="/opt/sochi-portal"              # для docker compose up -d при падении
DISK_PATH="/"
DISK_WARN=90                                 # % занятости диска → алерт
MEM_WARN_MB=120                              # меньше столько доступной памяти → алерт
AUTO_RESTART=1                               # пытаться перезапускать упавшие/unhealthy
COOLDOWN_MIN=15                              # не слать одинаковый алерт чаще, мин
LOG="/var/log/yp-watchdog.log"
STATE_DIR="/var/lib/yp-watchdog"
# каналы оповещения (заполнить в конфиге):
ALERT_TG_TOKEN=""                            # Telegram bot token
ALERT_TG_CHAT=""                             # Telegram chat id
ALERT_EMAIL=""                               # email (нужен работающий 'mail'/'sendmail')

# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

mkdir -p "$STATE_DIR" 2>/dev/null
touch "$LOG" 2>/dev/null
HOSTN="$(hostname 2>/dev/null || echo host)"

log(){ printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

_send(){ # <text>
  local text="$1"
  if [ -n "$ALERT_TG_TOKEN" ] && [ -n "$ALERT_TG_CHAT" ]; then
    curl -sS -m 15 -o /dev/null \
      --data-urlencode "chat_id=${ALERT_TG_CHAT}" \
      --data-urlencode "text=[${HOSTN}] ${text}" \
      "https://api.telegram.org/bot${ALERT_TG_TOKEN}/sendMessage" 2>/dev/null
  fi
  if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
    printf '%s\n' "$text" | mail -s "[yp-watchdog:${HOSTN}] alert" "$ALERT_EMAIL" 2>/dev/null
  fi
}

# alert <key> <fail|ok> <message> — с антиспамом и уведомлением о восстановлении
alert(){
  local key="$1" st="$2" msg="$3"
  local sf="$STATE_DIR/state_$key"; local now; now=$(date +%s)
  local prev="ok"; [ -f "$sf" ] && prev="$(cut -d' ' -f1 "$sf" 2>/dev/null)"
  local last=0;    [ -f "$sf" ] && last="$(cut -d' ' -f2 "$sf" 2>/dev/null)"
  if [ "$st" = "fail" ]; then
    log "FAIL[$key] $msg"
    if [ "$prev" != "fail" ] || [ $(( now - ${last:-0} )) -ge $(( COOLDOWN_MIN*60 )) ]; then
      _send "❌ $msg"; echo "fail $now" > "$sf"
    else echo "fail ${last:-$now}" > "$sf"; fi
  else
    if [ "$prev" = "fail" ]; then log "RECOVER[$key] $msg"; _send "✅ восстановлено: $msg"; fi
    echo "ok $now" > "$sf"
  fi
}

command -v docker >/dev/null 2>&1 && HAS_DOCKER=1 || HAS_DOCKER=0

# ---------------- 1) контейнеры ----------------
if [ "$HAS_DOCKER" = 1 ]; then
  for c in $CONTAINERS; do
    running=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo "missing")
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo "?")
    if [ "$running" != "true" ] || [ "$health" = "unhealthy" ]; then
      msg="контейнер $c: running=$running health=$health"
      if [ "$AUTO_RESTART" = 1 ]; then
        log "restart attempt: $c"
        if [ -n "$COMPOSE_DIR" ] && [ -f "$COMPOSE_DIR/docker-compose.yml" ]; then
          (cd "$COMPOSE_DIR" && (docker compose up -d >/dev/null 2>&1 || docker-compose up -d >/dev/null 2>&1))
        fi
        docker restart "$c" >/dev/null 2>&1
        sleep 5
        running=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo "missing")
        msg="$msg → после рестарта running=$running"
      fi
      alert "cont_$c" fail "$msg"
    else
      alert "cont_$c" ok "контейнер $c в порядке"
    fi
  done
fi

# ---------------- 2) HTTP health ----------------
if [ -n "$HEALTH_URL" ]; then
  args=(-sS -o /dev/null -m "$HTTP_TIMEOUT" -w '%{http_code}')
  [ -n "$RESOLVE" ] && args+=(--resolve "$RESOLVE")
  code=$(curl "${args[@]}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    alert http ok "health $HEALTH_URL → 200"
  else
    alert http fail "health $HEALTH_URL → $code"
  fi
fi

# ---------------- 3) диск ----------------
usep=$(df "$DISK_PATH" 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}')
if [ -n "$usep" ] && [ "$usep" -ge "$DISK_WARN" ]; then
  alert disk fail "диск $DISK_PATH заполнен на ${usep}% (порог ${DISK_WARN}%)"
else
  alert disk ok "диск ${usep:-?}%"
fi

# ---------------- 4) память ----------------
avail=$(free -m 2>/dev/null | awk '/Mem:/{print $7}')
if [ -n "$avail" ] && [ "$avail" -lt "$MEM_WARN_MB" ]; then
  alert mem fail "мало свободной памяти: ${avail}MB (порог ${MEM_WARN_MB}MB)"
else
  alert mem ok "память ${avail:-?}MB свободно"
fi

exit 0
