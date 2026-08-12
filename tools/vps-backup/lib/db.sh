#!/usr/bin/env bash
# Consistent database backups (safe with running services).

sqlite_online_backup() {
  local db="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if cmd_exists sqlite3; then
    # Online consistent backup API — OK while DB is open (WAL-friendly)
    if sqlite3 "$db" ".backup '$dest'" 2>/dev/null; then
      return 0
    fi
    # fallback vacuum into
    if sqlite3 "$db" "VACUUM INTO '$dest';" 2>/dev/null; then
      return 0
    fi
  fi
  # last resort: short copy (may be inconsistent if writers active)
  warn "sqlite online backup failed for $db — using file copy (risk)"
  cp -a "$db" "$dest"
  [[ -f "${db}-wal" ]] && cp -a "${db}-wal" "${dest}-wal" || true
  [[ -f "${db}-shm" ]] && cp -a "${db}-shm" "${dest}-shm" || true
}

backup_sqlite_tree() {
  local root="$1" out="$2"
  [[ -d "$root" ]] || return 0
  mkdir -p "$out"
  while IFS= read -r -d '' db; do
    local rel="${db#$root/}"
    local dest="$out/${rel}"
    mkdir -p "$(dirname "$dest")"
    log "sqlite backup $db"
    sqlite_online_backup "$db" "$dest"
  done < <(find "$root" -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) -print0 2>/dev/null)
}

backup_postgres_logical() {
  local out="$1"
  mkdir -p "$out"
  if ! cmd_exists pg_dumpall && ! cmd_exists pg_dump; then
    return 0
  fi
  if cmd_exists pg_dumpall; then
    log "postgresql pg_dumpall"
    if su -s /bin/bash postgres -c "pg_dumpall --clean --if-exists" >"$out/pg_dumpall.sql" 2>"$out/pg_dumpall.err"; then
      gzip -f "$out/pg_dumpall.sql"
    else
      warn "pg_dumpall failed (see pg_dumpall.err) — trying docker/postgres later"
    fi
  fi
}

backup_mysql_logical() {
  local out="$1"
  mkdir -p "$out"
  if ! cmd_exists mysqldump; then
    return 0
  fi
  # Try socket auth as root (Debian) or skip if no grants
  log "mysql/mariadb mysqldump --all-databases"
  if mysqldump --all-databases --single-transaction --quick --routines --events \
      >"$out/all-databases.sql" 2>"$out/mysqldump.err"; then
    gzip -f "$out/all-databases.sql"
  else
    warn "mysqldump failed (see mysqldump.err)"
    rm -f "$out/all-databases.sql"
  fi
}

backup_redis_rdb() {
  local out="$1"
  mkdir -p "$out"
  if ! cmd_exists redis-cli; then
    return 0
  fi
  if redis-cli ping 2>/dev/null | grep -qi pong; then
    log "redis BGSAVE + copy dump"
    redis-cli BGSAVE >/dev/null 2>&1 || true
    sleep 2
    local dump
    for dump in /var/lib/redis/dump.rdb /var/lib/redis/*/dump.rdb; do
      [[ -f "$dump" ]] || continue
      cp -a "$dump" "$out/$(path_slug "$dump").rdb"
    done
  fi
}

backup_all_databases() {
  local out="$1"
  mkdir -p "$out"/{sqlite,postgres,mysql,redis}

  # Common sqlite locations (do NOT scan all of /var/lib — bolt/docker metas are not sqlite)
  backup_sqlite_tree /etc/x-ui "$out/sqlite/x-ui" || true
  backup_sqlite_tree /opt/wg-panel "$out/sqlite/wg-panel" || true
  backup_sqlite_tree /var/lib/wg-audit "$out/sqlite/wg-audit" || true
  backup_sqlite_tree /var/lib/fail2ban "$out/sqlite/fail2ban" || true

  backup_postgres_logical "$out/postgres"
  backup_mysql_logical "$out/mysql"
  backup_redis_rdb "$out/redis"

  # Dockerized DBs handled in docker.sh
}
