#!/usr/bin/env bash
# Enqueue daily backup for the selected admin chat (MSK hour from SiteSettings).
set -euo pipefail
ROOT=/opt/sochi-portal
LOG=/var/log/sochi-tg-backup.log
REQ_DIR=$ROOT/data/backup-requests
cd "$ROOT"
set -a; source "$ROOT/.env" 2>/dev/null || true; set +a

row=$(docker-compose exec -T db psql -U "${POSTGRES_USER:-sochi}" -d "${POSTGRES_DB:-sochi_portal}" -Atqc \
  "SELECT COALESCE(\"dailyBackupEnabled\"::text,'false')||'|'||COALESCE(\"dailyBackupChatId\",'')||'|'||COALESCE(\"dailyBackupHour\"::text,'3') FROM \"SiteSettings\" WHERE id='1';" 2>/dev/null || true)
enabled=$(echo "$row" | cut -d'|' -f1)
chat=$(echo "$row" | cut -d'|' -f2)
hour=$(echo "$row" | cut -d'|' -f3)
hour=${hour:-3}

# Moscow time hour
msk_hour=$(TZ=Europe/Moscow date +%H)
msk_hour=$((10#$msk_hour))
want=$((10#$hour))

if [[ "$enabled" != "t" && "$enabled" != "true" ]]; then
  exit 0
fi
if [[ -z "$chat" ]]; then
  echo "$(date -Is) daily-backup: no chat configured" >>"$LOG"
  exit 0
fi
if [[ "$msk_hour" -ne "$want" ]]; then
  exit 0
fi

# once per calendar day
stamp=$(TZ=Europe/Moscow date +%F)
marker="$REQ_DIR/.daily-$stamp"
if [[ -f "$marker" ]]; then
  exit 0
fi

mkdir -p "$REQ_DIR"
id="daily-$stamp"
cat > "$REQ_DIR/${id}.json" <<JSON
{"id":"$id","chatId":"$chat","kind":"daily","fromUserId":null,"fromUsername":"cron-daily","requestedAt":"$(date -Is)"}
JSON
echo "$stamp" > "$marker"
chown -R 1000:1000 "$REQ_DIR" 2>/dev/null || true
echo "$(date -Is) daily-backup queued for chat $chat" >>"$LOG"
# process immediately
"$ROOT/scripts/process-tg-backup-requests.sh" || true
