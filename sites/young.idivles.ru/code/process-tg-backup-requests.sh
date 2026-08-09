#!/usr/bin/env bash
# Process Telegram backup queue + password reveal requests (HOST, root).
# Archives are AES-256-CBC encrypted; plaintext dumps are removed after encrypt.
set -euo pipefail

ROOT="/opt/sochi-portal"
REQ_DIR="$ROOT/data/backup-requests"
PWD_DIR="$REQ_DIR/password-requests"
DONE_DIR="$REQ_DIR/done"
FAIL_DIR="$REQ_DIR/failed"
BACKUP_DIR="/var/backups/sochi-portal/tg"
SECRET_DIR="$ROOT/data/backup-secrets"
LOCK="/tmp/sochi-tg-backup.lock"
LOG="/var/log/sochi-tg-backup.log"

mkdir -p "$REQ_DIR" "$PWD_DIR" "$DONE_DIR" "$FAIL_DIR" "$BACKUP_DIR" "$SECRET_DIR"
chown -R 1000:1000 "$REQ_DIR" 2>/dev/null || true
chmod -R ug+rwX "$REQ_DIR" 2>/dev/null || true
chown root:root "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

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

VAULT_KEY="${BACKUP_VAULT_KEY:-${NEXTAUTH_SECRET:-}}"
if [[ -z "$VAULT_KEY" ]]; then
  echo "$(date -Is) no BACKUP_VAULT_KEY/NEXTAUTH_SECRET" >>"$LOG"
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
  local sz
  sz=$(stat -c%s "$file" 2>/dev/null || echo 0)
  if [[ "$sz" -gt 49000000 ]]; then
    send_msg "$chat" "⚠️ Файл $(basename "$file") слишком большой (${sz} байт) для Telegram. На сервере: <code>$file</code>"
    return 1
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendDocument" \
    -F "chat_id=${chat}" \
    -F "document=@${file}" \
    -F "caption=${caption}" >/dev/null
}

encrypt_file() {
  local src="$1" dest="$2" pass="$3"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$src" -out "$dest" -pass pass:"$pass"
}

store_secret() {
  local stamp="$1" pass="$2" chat="$3" kind="$4"
  local meta="$SECRET_DIR/${stamp}.meta.json"
  local enc="$SECRET_DIR/${stamp}.pass.enc"
  umask 077
  printf '%s' "$pass" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -out "$enc" -pass pass:"$VAULT_KEY"
  cat >"$meta" <<JSON
{"stamp":"$stamp","chatId":"$chat","kind":"$kind","createdAt":"$(date -Is)","files":["db-${stamp}.dump.enc","full-${stamp}.tar.gz.enc"]}
JSON
  chmod 600 "$enc" "$meta"
  chown root:root "$enc" "$meta"
}

read_pass() {
  local stamp="$1"
  local enc="$SECRET_DIR/${stamp}.pass.enc"
  [[ -f "$enc" ]] || return 1
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$enc" -pass pass:"$VAULT_KEY" 2>/dev/null
}

# --- password reveal requests ---
shopt -s nullglob
for preq in "$PWD_DIR"/*.json; do
  base="$(basename "$preq")"
  echo "$(date -Is) password-request $base" >>"$LOG"
  chatId="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("chatId",""))' "$preq")"
  if [[ -z "$chatId" ]]; then
    mv "$preq" "$FAIL_DIR/"
    continue
  fi
  latest="$(ls -1t "$SECRET_DIR"/*.meta.json 2>/dev/null | head -1 || true)"
  if [[ -z "$latest" ]]; then
    send_msg "$chatId" "ℹ️ Сохранённых паролей бэкапа пока нет. Сначала запросите бэкап фразой Абракадабра."
    mv "$preq" "$DONE_DIR/"
    continue
  fi
  stamp="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("stamp",""))' "$latest")"
  allowed="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("chatId",""))' "$latest")"
  # Only original recipient or current daily/alert chat may receive password
  daily="$(docker-compose exec -T db psql -U "${POSTGRES_USER:-sochi}" -d "${POSTGRES_DB:-sochi_portal}" -Atqc \
    "SELECT COALESCE(\"dailyBackupChatId\",'') FROM \"SiteSettings\" WHERE id='1';" 2>/dev/null || true)"
  alerts="$(docker-compose exec -T db psql -U "${POSTGRES_USER:-sochi}" -d "${POSTGRES_DB:-sochi_portal}" -Atqc \
    "SELECT COALESCE(\"telegramAlertChatIds\",'') FROM \"SiteSettings\" WHERE id='1';" 2>/dev/null || true)"
  ok_chat=0
  [[ "$chatId" == "$allowed" ]] && ok_chat=1
  [[ -n "$daily" && "$chatId" == "$daily" ]] && ok_chat=1
  echo ",$alerts," | grep -q ",$chatId," && ok_chat=1
  if [[ "$ok_chat" -ne 1 ]]; then
    send_msg "$chatId" "⛔ Пароль бэкапа доступен только выбранному админу-получателю."
    mv "$preq" "$FAIL_DIR/"
    continue
  fi
  pass="$(read_pass "$stamp" || true)"
  if [[ -z "$pass" ]]; then
    send_msg "$chatId" "❌ Не удалось расшифровать запись пароля для <code>$stamp</code>."
    mv "$preq" "$FAIL_DIR/"
    continue
  fi
  send_msg "$chatId" "🔑 Пароль от бэкапа <code>$stamp</code>:

<code>$pass</code>

Расшифровка (Linux):
<code>openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in FILE.enc -out FILE -pass pass:…</code>"
  mv "$preq" "$DONE_DIR/"
done

# --- backup build requests ---
requests=("$REQ_DIR"/*.json)
if ((${#requests[@]} == 0)); then
  exit 0
fi

for req in "${requests[@]}"; do
  base="$(basename "$req")"
  # skip non-request leftovers
  [[ "$base" == *.json ]] || continue
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
  DB_ENC="$BACKUP_DIR/db-${STAMP}.dump.enc"
  FULL_ENC="$BACKUP_DIR/full-${STAMP}.tar.gz.enc"
  MANIFEST="$BACKUP_DIR/manifest-${STAMP}.txt"
  PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"

  send_msg "$chatId" "📦 Сборка и шифрование бэкапа <code>${STAMP}</code> (${kind})…"

  set +e
  docker exec sochi-portal_db_1 pg_dump -U "${POSTGRES_USER:-sochi}" -Fc "${POSTGRES_DB:-sochi_portal}" >"$DB_OUT"
  db_rc=$?
  cp -f "$ROOT/.env" "$BACKUP_DIR/env-${STAMP}.env"
  tar -czf "$FULL_OUT" \
    -C /opt \
      --exclude='sochi-portal/node_modules' \
      --exclude='sochi-portal/.next' \
      --exclude='sochi-portal/data/postgres' \
      --exclude='sochi-portal/data/backup-requests' \
      --exclude='sochi-portal/data/backup-secrets' \
      --exclude='sochi-portal/.git' \
      sochi-portal \
    -C "$BACKUP_DIR" --transform="s|^env-${STAMP}\\.env\$|sochi-portal/.env.backup|" "env-${STAMP}.env"
  tar_rc=$?
  rm -f "$BACKUP_DIR/env-${STAMP}.env"

  encrypt_file "$DB_OUT" "$DB_ENC" "$PASS"
  enc_db=$?
  encrypt_file "$FULL_OUT" "$FULL_ENC" "$PASS"
  enc_full=$?
  set -e

  # wipe plaintext ASAP
  shred -u "$DB_OUT" 2>/dev/null || rm -f "$DB_OUT"
  shred -u "$FULL_OUT" 2>/dev/null || rm -f "$FULL_OUT"

  {
    echo "stamp=$STAMP"
    echo "kind=$kind"
    echo "encrypted=aes-256-cbc-pbkdf2-iter200000"
    echo "db_rc=$db_rc tar_rc=$tar_rc enc_db=$enc_db enc_full=$enc_full"
    echo "db=$(basename "$DB_ENC") size=$(stat -c%s "$DB_ENC" 2>/dev/null || echo 0)"
    echo "full=$(basename "$FULL_ENC") size=$(stat -c%s "$FULL_ENC" 2>/dev/null || echo 0)"
    echo "password_phrase=Шумко Евгений, дай пароль!"
    echo "host=$(hostname)"
    echo "created=$(date -Is)"
  } >"$MANIFEST"

  if [[ $db_rc -ne 0 || $tar_rc -ne 0 || $enc_db -ne 0 || $enc_full -ne 0 ]]; then
    send_msg "$chatId" "❌ Ошибка сборки/шифрования бэкапа (db=$db_rc tar=$tar_rc enc=$enc_db/$enc_full)."
    mv "$req" "$FAIL_DIR/"
    continue
  fi

  store_secret "$STAMP" "$PASS" "$chatId" "$kind"

  set +e
  send_doc "$chatId" "$DB_ENC" "🗄️ БД (AES-256) ${STAMP}"
  send_db=$?
  send_doc "$chatId" "$FULL_ENC" "📁 Проект (AES-256) ${STAMP}"
  send_full=$?
  send_doc "$chatId" "$MANIFEST" "📋 Манифест ${STAMP}"
  set -e

  if [[ $send_db -eq 0 && $send_full -eq 0 ]]; then
    send_msg "$chatId" "✅ Зашифрованный бэкап отправлен (${kind}).

Пароль <b>не</b> приходит вместе с файлами.
Получить пароль командой:
<code>Шумко Евгений, дай пароль!</code>"
    mv "$req" "$DONE_DIR/"
    rm -f "$REQ_DIR/.pending"
  else
    send_msg "$chatId" "⚠️ Часть файлов не отправилась (db=$send_db full=$send_full). Шифроархивы: $BACKUP_DIR"
    mv "$req" "$FAIL_DIR/"
  fi

  # keep last 5 encrypted sets
  ls -1t "$BACKUP_DIR"/full-*.tar.gz.enc 2>/dev/null | tail -n +6 | while read -r f; do
    stem="${f%.tar.gz.enc}"; stem="$(basename "$stem" | sed 's/^full-//')"
    rm -f "$BACKUP_DIR/full-${stem}.tar.gz.enc" "$BACKUP_DIR/db-${stem}.dump.enc" "$BACKUP_DIR/manifest-${stem}.txt"
    rm -f "$SECRET_DIR/${stem}.pass.enc" "$SECRET_DIR/${stem}.meta.json"
  done
  # remove any leftover plaintext
  rm -f "$BACKUP_DIR"/full-*.tar.gz "$BACKUP_DIR"/db-*.dump 2>/dev/null || true
done

echo "$(date -Is) done" >>"$LOG"
