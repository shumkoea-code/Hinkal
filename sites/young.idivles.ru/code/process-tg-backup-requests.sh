#!/usr/bin/env bash
# Process pending Telegram Abracadabra / daily backup requests on the HOST.
set -euo pipefail

ROOT="/opt/sochi-portal"
REQ_DIR="$ROOT/data/backup-requests"
DONE_DIR="$REQ_DIR/done"
FAIL_DIR="$REQ_DIR/failed"
BACKUP_DIR="/var/backups/sochi-portal/tg"
LOCK="/tmp/sochi-tg-backup.lock"
LOG="/var/log/sochi-tg-backup.log"

mkdir -p "$REQ_DIR" "$DONE_DIR" "$FAIL_DIR" "$BACKUP_DIR"
# web container runs as uid 1000
chown -R 1000:1000 "$REQ_DIR" 2>/dev/null || true
chmod -R ug+rwX "$REQ_DIR" 2>/dev/null || true

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) already running" >>"$LOG"
  exit 0
fi

cd "$ROOT"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
set +a

fetch_token() {
  local t="${TELEGRAM_BOT_TOKEN:-}"
  if [[ -n "$t" ]]; then echo "$t"; return; fi
  t="${ALERT_TG_TOKEN:-}"
  if [[ -n "$t" ]]; then echo "$t"; return; fi
  docker-compose -f "$ROOT/docker-compose.yml" exec -T db \
    psql -U "${POSTGRES_USER:-sochi}" -d "${POSTGRES_DB:-sochi_portal}" -Atqc \
    "SELECT COALESCE(\"telegramBotToken\", '') FROM \"SiteSettings\" WHERE id='1';" 2>/dev/null || true
}

TOKEN="$(fetch_token | tr -d '\r\n')"
if [[ -z "$TOKEN" ]]; then
  echo "$(date -Is) no telegram token" >>"$LOG"
  exit 0
fi

send_msg() {
  local chat="$1" text="$2"
  curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -d "chat_id=${chat}" \
    --data-urlencode "text=${text}" \
    -d "parse_mode=HTML" >/dev/null || true
}

send_doc() {
  local chat="$1" file="$2" caption="$3"
  # Telegram limit ~50MB
  local sz
  sz=$(stat -c%s "$file" 2>/dev/null || echo 0)
  if [[ "$sz" -gt 49000000 ]]; then
    send_msg "$chat" "⚠️ Файл $(basename "$file") слишком большой (${sz} байт) для Telegram. Лежит на сервере: $file"
    return 1
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendDocument" \
    -F "chat_id=${chat}" \
    -F "document=@${file}" \
    -F "caption=${caption}" >/dev/null
}

shopt -s nullglob
requests=("$REQ_DIR"/*.json)
if ((${#requests[@]} == 0)); then
  exit 0
fi

for req in "${requests[@]}"; do
  base="$(basename "$req")"
  echo "$(date -Is) processing $base" >>"$LOG"
  chatId="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("chatId",""))' "$req")"
  kind="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("kind","manual"))' "$req")"
  if [[ -z "$chatId" ]]; then
    mv "$req" "$FAIL_DIR/"
    continue
  fi

  STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
  DB_OUT="$BACKUP_DIR/db-${STAMP}.dump"
  FULL_OUT="$BACKUP_DIR/full-${STAMP}.tar.gz"
  MANIFEST="$BACKUP_DIR/manifest-${STAMP}.txt"

  send_msg "$chatId" "📦 Сборка бэкапа <code>${STAMP}</code> (${kind})…"

  set +e
  docker exec sochi-portal_db_1 pg_dump -U "${POSTGRES_USER:-sochi}" -Fc "${POSTGRES_DB:-sochi_portal}" >"$DB_OUT"
  db_rc=$?
  # One-pass archive (cannot append to gzip). Include .env as sochi-portal/.env.backup
  cp -f "$ROOT/.env" "$BACKUP_DIR/env-${STAMP}.env"
  tar -czf "$FULL_OUT" \
    -C /opt \
      --exclude='sochi-portal/node_modules' \
      --exclude='sochi-portal/.next' \
      --exclude='sochi-portal/data/postgres' \
      --exclude='sochi-portal/data/backup-requests' \
      --exclude='sochi-portal/.git' \
      sochi-portal \
    -C "$BACKUP_DIR" --transform="s|^env-${STAMP}\.env\$|sochi-portal/.env.backup|" "env-${STAMP}.env"
  tar_rc=$?
  rm -f "$BACKUP_DIR/env-${STAMP}.env"
  set -e

  {
    echo "stamp=$STAMP"
    echo "kind=$kind"
    echo "db_rc=$db_rc"
    echo "tar_rc=$tar_rc"
    echo "db=$(basename "$DB_OUT") size=$(stat -c%s "$DB_OUT" 2>/dev/null || echo 0)"
    echo "full=$(basename "$FULL_OUT") size=$(stat -c%s "$FULL_OUT" 2>/dev/null || echo 0)"
    echo "host=$(hostname)"
    echo "created=$(date -Is)"
  } >"$MANIFEST"

  if [[ $db_rc -ne 0 || $tar_rc -ne 0 ]]; then
    send_msg "$chatId" "❌ Ошибка сборки бэкапа (db=$db_rc tar=$tar_rc)."
    mv "$req" "$FAIL_DIR/"
    continue
  fi

  set +e
  send_doc "$chatId" "$DB_OUT" "🗄️ Дамп PostgreSQL ${STAMP}"
  send_db=$?
  send_doc "$chatId" "$FULL_OUT" "📁 Полный архив проекта ${STAMP}"
  send_full=$?
  send_doc "$chatId" "$MANIFEST" "📋 Манифест ${STAMP}"
  set -e

  if [[ $send_db -eq 0 && $send_full -eq 0 ]]; then
    send_msg "$chatId" "✅ Бэкап отправлен (${kind}). Храните файлы в безопасном месте."
    mv "$req" "$DONE_DIR/"
    rm -f "$REQ_DIR/.pending"
  else
    send_msg "$chatId" "⚠️ Часть файлов не отправилась (db=$send_db full=$send_full). Архивы: $BACKUP_DIR"
    mv "$req" "$FAIL_DIR/"
  fi

  ls -1t "$BACKUP_DIR"/full-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
  ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
  ls -1t "$BACKUP_DIR"/manifest-*.txt 2>/dev/null | tail -n +6 | xargs -r rm -f
done

echo "$(date -Is) done" >>"$LOG"
