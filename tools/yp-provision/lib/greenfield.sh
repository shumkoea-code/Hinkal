#!/usr/bin/env bash
# shellcheck shell=bash
# Greenfield: clean portal for another organization

ask_greenfield_site() {
  banner "Параметры нового сайта"
  prompt YP_SITE_DOMAIN "Домен (например crm.example.org)"
  prompt YP_SITE_NAME "Название организации / сайта" "Молодёжный центр"
  prompt YP_SITE_SHORT "Короткое имя (бренд в UI)" "МЦ"
  prompt YP_ADMIN_EMAIL "Email первого администратора" "admin@${YP_SITE_DOMAIN#www.}"
  prompt_secret YP_ADMIN_PASSWORD "Пароль администратора (мин. 8)"
  prompt YP_TZ "Часовой пояс" "Europe/Moscow"
  prompt YP_LOCALE "Локаль" "ru"
  prompt YP_INSTALL_DIR "Каталог на VPS" "/opt/youth-portal"
  prompt YP_HTTP_PORT "Внутренний порт web-контейнера" "3000"
  prompt YP_ENABLE_SSL "Выпустить Let's Encrypt? (y/n)" "y"
  prompt YP_LE_EMAIL "Email для Let's Encrypt" "$YP_ADMIN_EMAIL"
  prompt YP_SOURCE_MODE "Источник кода: 1=rsync с primary 2=уже есть архив на VPS" "1"
  if [[ "$YP_SOURCE_MODE" == "1" ]]; then
    prompt YP_PRIMARY_DIR "Локальный/primary путь к коду портала" "/opt/sochi-portal"
  else
    prompt YP_CODE_ARCHIVE "Путь к tar.gz на целевом VPS" "/root/youth-portal-src.tar.gz"
  fi
  YP_NEXTAUTH_SECRET="${YP_NEXTAUTH_SECRET:-$(random_secret)}"
  YP_DB_PASSWORD="${YP_DB_PASSWORD:-$(random_secret)}"
  export YP_SITE_DOMAIN YP_SITE_NAME YP_SITE_SHORT YP_ADMIN_EMAIL YP_ADMIN_PASSWORD
  export YP_TZ YP_LOCALE YP_INSTALL_DIR YP_HTTP_PORT YP_ENABLE_SSL YP_LE_EMAIL
  export YP_SOURCE_MODE YP_PRIMARY_DIR YP_CODE_ARCHIVE YP_NEXTAUTH_SECRET YP_DB_PASSWORD
}

run_greenfield() {
  banner "Greenfield install"
  require_cmd rsync
  require_cmd ssh

  info "Базовые пакеты + Docker на целевом VPS…"
  remote_bash <<'EOS'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync ufw fail2ban nginx certbot python3-certbot-nginx jq openssl
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin || true
# legacy binary fallback
command -v docker-compose >/dev/null || apt-get install -y -qq docker-compose || true
EOS

  if [[ "$YP_SOURCE_MODE" == "1" ]]; then
    [[ -d "$YP_PRIMARY_DIR" ]] || die "Нет исходников: $YP_PRIMARY_DIR (запускайте с primary VPS или смонтируйте код)"
    info "Копирую код (без node_modules/.next/data)…"
    remote "mkdir -p '$YP_INSTALL_DIR'"
    local rsh
    if [[ -n "${YP_SSH_KEY:-}" ]]; then
      rsh="ssh -i ${YP_SSH_KEY} -o IdentitiesOnly=yes -p ${YP_SSH_PORT} -o StrictHostKeyChecking=accept-new"
    else
      rsh="sshpass -p ${YP_SSH_PASS} ssh -p ${YP_SSH_PORT} -o PreferredAuthentications=password -o StrictHostKeyChecking=accept-new"
    fi
    if ! rsync -az --delete \
      --exclude node_modules --exclude .next --exclude data --exclude 'public/uploads' \
      --exclude .env --exclude .git \
      -e "$rsh" \
      "$YP_PRIMARY_DIR/" "${YP_SSH_USER}@${YP_SSH_HOST}:${YP_INSTALL_DIR}/"; then
      warn "rsync не удался — пробую tar pipe"
      tar -C "$YP_PRIMARY_DIR" \
        --exclude=node_modules --exclude=.next --exclude=data --exclude=public/uploads --exclude=.env --exclude=.git \
        -czf - . | remote "mkdir -p '$YP_INSTALL_DIR' && tar -C '$YP_INSTALL_DIR' -xzf -"
    fi
  else
    remote "mkdir -p '$YP_INSTALL_DIR' && tar -C '$YP_INSTALL_DIR' -xzf '$YP_CODE_ARCHIVE'"
  fi

  info "Пишу .env и site bootstrap…"
  # shellcheck disable=SC2087
  remote_bash <<EOS
set -euo pipefail
cd '$YP_INSTALL_DIR'
umask 077
cat > .env <<'ENV'
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=$YP_HTTP_PORT
NEXTAUTH_URL=https://$YP_SITE_DOMAIN
NEXTAUTH_SECRET=$YP_NEXTAUTH_SECRET
DATABASE_URL=postgresql://portal:${YP_DB_PASSWORD}@db:5432/portal?schema=public
REDIS_URL=redis://redis:6379
TZ=$YP_TZ
SITE_NAME=$YP_SITE_NAME
SITE_DOMAIN=$YP_SITE_DOMAIN
ADMIN_BOOTSTRAP_EMAIL=$YP_ADMIN_EMAIL
ADMIN_BOOTSTRAP_PASSWORD=$YP_ADMIN_PASSWORD
# Email optional — portal skips outbound mail when key empty/placeholder
RESEND_API_KEY=
ENV
chmod 600 .env

# nginx site
cat > /etc/nginx/sites-available/youth-portal.conf <<NGX
server {
  listen 80;
  server_name $YP_SITE_DOMAIN;
  client_max_body_size 50m;
  location / {
    proxy_pass http://127.0.0.1:$YP_HTTP_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGX
ln -sfn /etc/nginx/sites-available/youth-portal.conf /etc/nginx/sites-enabled/youth-portal.conf
nginx -t && systemctl reload nginx

# compose up (expects docker-compose.yml in tree)
if [[ -f docker-compose.yml ]]; then
  docker compose pull || true
  docker compose build web || docker-compose build web
  docker compose up -d || docker-compose up -d
else
  echo "WARN: нет docker-compose.yml — положите стек вручную" >&2
fi

# seed site settings via SQL if prisma/db ready (best-effort)
sleep 5
docker compose exec -T db psql -U portal -d portal -c \
  "UPDATE \\\"SiteSettings\\\" SET \\\"siteName\\\"='$YP_SITE_NAME' WHERE id IS NOT NULL;" 2>/dev/null || true

if [[ '$YP_ENABLE_SSL' == 'y' || '$YP_ENABLE_SSL' == 'Y' ]]; then
  certbot --nginx -d '$YP_SITE_DOMAIN' --non-interactive --agree-tos -m '$YP_LE_EMAIL' || \
    echo "WARN: certbot не удался — проверьте DNS A-запись" >&2
fi

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true
EOS

  ok "Greenfield развёрнут: https://$YP_SITE_DOMAIN"
  echo "Админ: $YP_ADMIN_EMAIL (смените пароль после входа)"
  echo "Каталог: $YP_INSTALL_DIR"
}
