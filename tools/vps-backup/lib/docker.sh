#!/usr/bin/env bash
# Docker-aware backups.

backup_docker() {
  local out="$1"
  local volumes="$2"
  local images="$3"
  local compose_files="$4"

  mkdir -p "$out"
  if ! cmd_exists docker; then
    echo "docker=absent" >"$out/status.txt"
    return 0
  fi
  echo "docker=present" >"$out/status.txt"
  docker ps -a >"$out/ps-a.txt" 2>/dev/null || true
  docker volume ls >"$out/volumes.txt" 2>/dev/null || true
  docker images >"$out/images.txt" 2>/dev/null || true
  docker network ls >"$out/networks.txt" 2>/dev/null || true

  # Logical dumps from known DB containers
  mkdir -p "$out/db-dumps"
  while read -r cid names image; do
    [[ -z "$cid" ]] && continue
    local low
    low="$(echo "$image $names" | tr '[:upper:]' '[:lower:]')"
    if echo "$low" | grep -Eq 'postgres|postgis'; then
      log "docker postgres dump $names"
      if docker exec "$cid" sh -c 'pg_dumpall -U "${POSTGRES_USER:-postgres}"' \
          >"$out/db-dumps/${names//\//_}-pg_dumpall.sql" 2>"$out/db-dumps/${names//\//_}-pg.err"; then
        gzip -f "$out/db-dumps/${names//\//_}-pg_dumpall.sql"
      else
        # try without user env
        docker exec "$cid" pg_dumpall -U postgres \
          >"$out/db-dumps/${names//\//_}-pg_dumpall.sql" 2>>"$out/db-dumps/${names//\//_}-pg.err" \
          && gzip -f "$out/db-dumps/${names//\//_}-pg_dumpall.sql" \
          || warn "postgres dump failed in $names"
      fi
    fi
    if echo "$low" | grep -Eq 'mysql|mariadb|percona'; then
      log "docker mysql dump $names"
      docker exec "$cid" sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --all-databases --single-transaction --routines --events' \
        >"$out/db-dumps/${names//\//_}-mysql.sql" 2>"$out/db-dumps/${names//\//_}-mysql.err" \
        && gzip -f "$out/db-dumps/${names//\//_}-mysql.sql" \
        || warn "mysql dump failed in $names"
    fi
    if echo "$low" | grep -Eq 'redis'; then
      log "docker redis BGSAVE $names"
      docker exec "$cid" redis-cli BGSAVE >/dev/null 2>&1 || true
    fi
  done < <(docker ps --format '{{.ID}} {{.Names}} {{.Image}}' 2>/dev/null || true)

  # compose files
  mkdir -p "$out/compose"
  if [[ -n "$compose_files" ]]; then
    # shellcheck disable=SC2086
    for f in $compose_files; do
      [[ -f "$f" ]] || continue
      cp -a "$f" "$out/compose/"
      local dir
      dir="$(dirname "$f")"
      [[ -f "$dir/.env" ]] && cp -a "$dir/.env" "$out/compose/$(basename "$dir").env" || true
    done
  else
    # auto-discover common compose
    for f in /opt/*/docker-compose.yml /opt/*/*/docker-compose.yml /root/docker-compose.yml; do
      [[ -f "$f" ]] || continue
      cp -a "$f" "$out/compose/$(path_slug "$f").yml"
      local dir
      dir="$(dirname "$f")"
      [[ -f "$dir/.env" ]] && cp -a "$dir/.env" "$out/compose/$(path_slug "$dir").env" || true
    done
  fi

  if [[ "$volumes" -eq 1 ]]; then
    mkdir -p "$out/volumes"
    while read -r vol; do
      [[ -z "$vol" || "$vol" == "DRIVER" ]] && continue
      log "docker volume archive $vol"
      docker run --rm -v "$vol":/v:ro -v "$out/volumes":/backup alpine \
        tar -czf "/backup/${vol}.tar.gz" -C /v . \
        || warn "volume backup failed: $vol"
    done < <(docker volume ls -q 2>/dev/null || true)
  fi

  if [[ "$images" -eq 1 ]]; then
    mkdir -p "$out/image-tars"
    while read -r img; do
      [[ -z "$img" ]] && continue
      local safe
      safe="$(echo "$img" | tr '/:' '__')"
      log "docker save $img"
      docker save "$img" | gzip >"$out/image-tars/${safe}.tar.gz" || warn "docker save failed: $img"
    done < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>' || true)
  fi
}
