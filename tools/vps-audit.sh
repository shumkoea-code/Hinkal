#!/usr/bin/env bash
###############################################################################
# vps-audit.sh — быстрый аудит безопасности Linux-сервера (read-only)
#
# Настраиваемый неинвазивный аудит: НИЧЕГО не меняет, только читает состояние
# и выдаёт находки с уровнем важности + Markdown-отчёт и итоговую оценку.
#
# Использование:
#   sudo bash vps-audit.sh                       # все проверки, отчёт в ./vps-audit-<host>-<дата>.md
#   sudo bash vps-audit.sh -o report.md          # свой файл отчёта
#   sudo bash vps-audit.sh --only ssh,firewall   # только выбранные секции
#   sudo bash vps-audit.sh --skip docker         # пропустить секции
#   sudo bash vps-audit.sh --no-color
#
# Секции: system, updates, users, ssh, firewall, fail2ban, ports, docker,
#         files, cron, kernel, tls, logs
#
# Запускать под root для полноты (иначе часть проверок будет пропущена).
###############################################################################
set -u

OUTPUT=""; ONLY=""; SKIP=""; USE_COLOR=1
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output) OUTPUT="${2:-}"; shift 2;;
    --only) ONLY="${2:-}"; shift 2;;
    --skip) SKIP="${2:-}"; shift 2;;
    --no-color) USE_COLOR=0; shift;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "Неизвестная опция: $1" >&2; exit 2;;
  esac
done

if [ "$USE_COLOR" = 1 ] && [ -t 1 ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; Z=$'\033[0m'
else R=""; G=""; Y=""; B=""; D=""; Z=""; fi

HOST="$(hostname 2>/dev/null || echo host)"
[ -z "$OUTPUT" ] && OUTPUT="vps-audit-${HOST}-$(date +%Y%m%d-%H%M%S).md"
: > "$OUTPUT" 2>/dev/null || { echo "Не могу писать в $OUTPUT" >&2; exit 3; }

N_HIGH=0; N_MED=0; N_LOW=0; N_OK=0
declare -a ROWS=()
add(){ # <sev high|med|low|info|ok> <title> <detail>
  local sev="$1" title="$2" detail="$3" col lab
  case "$sev" in
    high) col="$R"; lab="HIGH"; N_HIGH=$((N_HIGH+1));;
    med)  col="$Y"; lab="MED "; N_MED=$((N_MED+1));;
    low)  col="$Y"; lab="LOW "; N_LOW=$((N_LOW+1));;
    ok)   col="$G"; lab=" OK "; N_OK=$((N_OK+1));;
    *)    col="$D"; lab="INFO";;
  esac
  printf '  %s[%s]%s %-34s %s%s%s\n' "$col" "$lab" "$Z" "$title" "$D" "$detail" "$Z"
  ROWS+=("| ${lab// /} | $title | ${detail//|/\\|} |")
}
sec(){ printf '\n%s== %s ==%s\n' "$B" "$1" "$Z"; }
want(){ # section name -> run?
  local s="$1"
  if [ -n "$ONLY" ]; then case ",$ONLY," in *",$s,"*) return 0;; *) return 1;; esac; fi
  if [ -n "$SKIP" ]; then case ",$SKIP," in *",$s,"*) return 1;; esac; fi
  return 0
}
have(){ command -v "$1" >/dev/null 2>&1; }

printf '%s VPS SECURITY AUDIT %s\n' "$B" "$Z"
printf 'Host: %s | Date: %s | User: %s\n' "$HOST" "$(date -u '+%F %T UTC')" "$(id -un)"
[ "$(id -u)" = 0 ] || printf '%s(не root — часть проверок будет пропущена)%s\n' "$Y" "$Z"

# ---------------- system / updates ----------------
if want system; then sec "Система"
  add info "OS" "$(. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME") | kernel $(uname -r)"
  add info "Uptime/Load" "$(uptime | sed 's/^ *//')"
  add info "CPU/RAM" "cores=$(nproc 2>/dev/null) | $(free -h 2>/dev/null | awk '/Mem:/{print "mem "$3"/"$2" avail "$7}')"
  SW=$(free -m 2>/dev/null | awk '/Swap:/{print $2}'); if [ "${SW:-0}" -gt 0 ]; then add ok "Swap" "${SW}MB"; else add med "Swap" "не настроен (риск OOM при пиках)"; fi
  DF=$(df -h / 2>/dev/null | awk 'NR==2{print $5" used, "$4" free"}'); USEP=$(df / 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}')
  if [ "${USEP:-0}" -ge 90 ]; then add high "Диск /" "$DF"; elif [ "${USEP:-0}" -ge 80 ]; then add med "Диск /" "$DF"; else add ok "Диск /" "$DF"; fi
fi

if want updates; then sec "Обновления"
  if have apt-get; then
    UPD=$(apt-get -s upgrade 2>/dev/null | grep -c '^Inst ')
    SEC=$(apt-get -s upgrade 2>/dev/null | grep -i security | grep -c '^Inst ')
    if [ "${SEC:-0}" -gt 0 ]; then add high "Обновления безопасности" "$SEC security-пакетов ждут установки (всего $UPD)"
    elif [ "${UPD:-0}" -gt 0 ]; then add low "Обновления" "$UPD пакетов можно обновить"
    else add ok "Обновления" "система актуальна"; fi
    if dpkg -l 2>/dev/null | grep -q unattended-upgrades; then add ok "unattended-upgrades" "установлен"; else add med "unattended-upgrades" "не установлен (нет авто-патчей)"; fi
    if [ -f /var/run/reboot-required ]; then add med "Перезагрузка" "требуется (обновлено ядро/libc)"; fi
  else add info "Обновления" "менеджер пакетов apt не найден"; fi
fi

# ---------------- users ----------------
if want users; then sec "Учётные записи"
  UID0=$(awk -F: '$3==0{print $1}' /etc/passwd | tr '\n' ' ')
  [ "$UID0" = "root " ] && add ok "UID 0" "только root" || add high "UID 0" "несколько аккаунтов с uid 0: $UID0"
  if [ -r /etc/shadow ]; then
    EMPTY=$(awk -F: '($2==""){print $1}' /etc/shadow | tr '\n' ' ')
    [ -n "$EMPTY" ] && add high "Пустые пароли" "$EMPTY" || add ok "Пустые пароли" "нет"
  fi
  SUDONP=$(grep -rEh 'NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null | grep -v '^#' | tr '\n' ';')
  [ -n "$SUDONP" ] && add med "sudo NOPASSWD" "$SUDONP" || add ok "sudo NOPASSWD" "не найдено"
fi

# ---------------- ssh ----------------
if want ssh; then sec "SSH"
  SC=/etc/ssh/sshd_config
  eff(){ sshd -T 2>/dev/null | grep -i "^$1 " | awk '{print $2}'; }
  PRL=$(eff permitrootlogin); PA=$(eff passwordauthentication); PORT=$(eff port)
  if [ -z "$PRL" ] && [ -r "$SC" ]; then PRL=$(grep -iE '^\s*PermitRootLogin' "$SC" | awk '{print $2}' | tail -1); fi
  if [ -z "$PA" ] && [ -r "$SC" ]; then PA=$(grep -iE '^\s*PasswordAuthentication' "$SC" | awk '{print $2}' | tail -1); fi
  case "$PRL" in yes) add high "PermitRootLogin" "yes (прямой вход root по паролю)";; prohibit-password|without-password) add low "PermitRootLogin" "$PRL (root только по ключу)";; no) add ok "PermitRootLogin" "no";; *) add info "PermitRootLogin" "${PRL:-?}";; esac
  case "$PA" in yes) add med "PasswordAuthentication" "yes (пароли включены — рекомендуются ключи)";; no) add ok "PasswordAuthentication" "no (только ключи)";; *) add info "PasswordAuthentication" "${PA:-?}";; esac
  [ "${PORT:-22}" = 22 ] && add low "SSH-порт" "22 (стандартный, больше автоскана)" || add ok "SSH-порт" "${PORT} (нестандартный)"
fi

# ---------------- firewall ----------------
if want firewall; then sec "Файрвол"
  if have ufw && ufw status 2>/dev/null | grep -qi 'Status: active'; then
    add ok "ufw" "active"; ufw status 2>/dev/null | grep -E '^[0-9]' | while read -r l; do :; done
  elif have nft && nft list ruleset 2>/dev/null | grep -q 'chain input'; then add ok "nftables" "правила присутствуют"
  elif have iptables && [ "$(iptables -S 2>/dev/null | grep -c '^-A')" -gt 0 ]; then add ok "iptables" "правила присутствуют"
  else add high "Файрвол" "не обнаружен активный firewall (ufw/nft/iptables)"; fi
fi

# ---------------- fail2ban ----------------
if want fail2ban; then sec "fail2ban"
  if have fail2ban-client && fail2ban-client ping >/dev/null 2>&1; then
    J=$(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:\s*//p')
    add ok "fail2ban" "работает, jails: ${J:-нет}"
  else add med "fail2ban" "не установлен/не запущен (нет защиты от перебора)"; fi
fi

# ---------------- ports ----------------
if want ports; then sec "Открытые порты (0.0.0.0/::)"
  if have ss; then
    ss -tlnpH 2>/dev/null | awk '{print $4, $6}' | grep -E '^0\.0\.0\.0|^\*|^\[::\]' | while read -r addr proc; do
      p=${addr##*:}; svc=$(echo "$proc" | sed -E 's/.*"([^"]+)".*/\1/')
      echo "PORT|$p|$svc"
    done | sort -u | while IFS='|' read -r _ p svc; do add info "Порт $p" "слушает публично ($svc)"; done
    PUBN=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -Ec '^0\.0\.0\.0|^\*|^\[::\]')
    [ "${PUBN:-0}" -gt 8 ] && add med "Публичные порты" "$PUBN портов слушают на всех интерфейсах — проверьте необходимость"
  else add info "Порты" "ss не найден"; fi
fi

# ---------------- docker ----------------
if want docker; then sec "Docker"
  if have docker && docker info >/dev/null 2>&1; then
    PRIV=$(docker ps -q 2>/dev/null | xargs -r -I{} sh -c 'docker inspect {} --format "{{.Name}} {{.HostConfig.Privileged}}"' 2>/dev/null | awk '$2=="true"{print $1}' | tr '\n' ' ')
    [ -n "$PRIV" ] && add high "Privileged-контейнеры" "$PRIV" || add ok "Privileged-контейнеры" "нет"
    SOCK=$(docker ps -q 2>/dev/null | xargs -r -I{} sh -c 'docker inspect {} --format "{{.Name}} {{range .Mounts}}{{.Source}} {{end}}"' 2>/dev/null | grep -l docker.sock 2>/dev/null)
    docker ps -q 2>/dev/null | while read -r c; do
      docker inspect "$c" --format '{{.Name}} {{range .Mounts}}{{.Source}}|{{end}}' 2>/dev/null | grep -q '/var/run/docker.sock' && echo "$c"
    done | grep -q . && add high "docker.sock" "смонтирован в контейнер (эквив. root на хосте)" || add ok "docker.sock" "не проброшен в контейнеры"
    PM=$(stat -c '%a' /var/run/docker.sock 2>/dev/null); add info "docker.sock права" "${PM:-?}"
  else add info "Docker" "не установлен/недоступен"; fi
fi

# ---------------- files ----------------
if want files; then sec "Файлы и права"
  WW=$(find / -xdev -type f -perm -0002 ! -path '/proc/*' ! -path '/sys/*' 2>/dev/null | grep -vE '^/(tmp|var/tmp|run|dev)/' | head -20)
  N=$(printf '%s\n' "$WW" | grep -c . )
  [ "${N:-0}" -gt 0 ] && add med "World-writable файлы" "$N шт (напр.: $(printf '%s' "$WW" | head -1))" || add ok "World-writable файлы" "не найдено (вне tmp)"
  ENVW=$(find / -xdev -type f -name '.env' -perm -0044 2>/dev/null | head -5 | tr '\n' ' ')
  [ -n "$ENVW" ] && add high ".env читаем всеми" "$ENVW" || add ok ".env права" "нет .env, читаемых всеми"
fi

# ---------------- cron ----------------
if want cron; then sec "Планировщик"
  CN=$( { crontab -l 2>/dev/null; cat /etc/crontab /etc/cron.d/* 2>/dev/null; } | grep -vE '^\s*#|^\s*$' | wc -l )
  add info "cron задания" "${CN:-0} строк (crontab+/etc/cron.*)"
  TMR=$(systemctl list-timers --no-legend 2>/dev/null | wc -l); add info "systemd timers" "${TMR:-0}"
fi

# ---------------- kernel ----------------
if want kernel; then sec "Ядро (sysctl)"
  chk(){ local v; v=$(sysctl -n "$1" 2>/dev/null); [ "$v" = "$2" ] && add ok "$1" "$v" || add low "$1" "${v:-?} (реком. $2)"; }
  chk net.ipv4.conf.all.rp_filter 1
  chk net.ipv4.tcp_syncookies 1
  chk kernel.randomize_va_space 2
  chk net.ipv4.conf.all.accept_redirects 0
fi

# ---------------- tls ----------------
if want tls; then sec "TLS-сертификаты (nginx)"
  if have openssl && [ -d /etc/letsencrypt/live ]; then
    for c in /etc/letsencrypt/live/*/fullchain.pem; do
      [ -f "$c" ] || continue; d=$(basename "$(dirname "$c")")
      end=$(openssl x509 -enddate -noout -in "$c" 2>/dev/null | cut -d= -f2)
      ee=$(date -d "$end" +%s 2>/dev/null); now=$(date +%s); days=$(( (ee-now)/86400 ))
      if [ "$days" -lt 0 ]; then add high "TLS $d" "истёк ($end)"; elif [ "$days" -lt 14 ]; then add med "TLS $d" "истекает через $days дн"; else add ok "TLS $d" "ещё $days дн"; fi
    done
  else add info "TLS" "letsencrypt/openssl не найдены"; fi
fi

# ---------------- logs ----------------
if want logs; then sec "Журналы (перебор входа)"
  LF=/var/log/auth.log; [ -f /var/log/secure ] && LF=/var/log/secure
  if [ -r "$LF" ]; then
    FAIL=$(grep -c 'Failed password' "$LF" 2>/dev/null)
    add info "Неуд. попытки SSH" "${FAIL:-0} в $LF"
  else add info "Журналы" "auth.log недоступен (может использоваться journald)"; fi
fi

# ---------------- score ----------------
SCORE=$((100 - N_HIGH*15 - N_MED*6 - N_LOW*2)); [ "$SCORE" -lt 0 ] && SCORE=0
if [ "$SCORE" -ge 90 ]; then GR=A; GC="$G"; elif [ "$SCORE" -ge 75 ]; then GR=B; GC="$G"; elif [ "$SCORE" -ge 60 ]; then GR=C; GC="$Y"; elif [ "$SCORE" -ge 45 ]; then GR=D; GC="$Y"; else GR=F; GC="$R"; fi
sec "ИТОГ"
printf '  Проблемы: %sвысокие %d%s | %sсредние %d%s | %sнизкие %d%s\n' "$R" "$N_HIGH" "$Z" "$Y" "$N_MED" "$Z" "$D" "$N_LOW" "$Z"
printf '  Оценка:   %s%s%s (%d/100)   Отчёт: %s\n' "$GC$B" "$GR" "$Z" "$SCORE" "$OUTPUT"

{
  echo "# VPS security audit — $HOST"
  echo; echo "- Дата: $(date -u '+%F %T UTC')"
  echo "- Оценка: **$GR ($SCORE/100)** — высокие: $N_HIGH, средние: $N_MED, низкие: $N_LOW"
  echo; echo "| Уровень | Проверка | Детали |"; echo "|---|---|---|"
  for r in "${ROWS[@]}"; do echo "$r"; done
  echo; echo "> Аудит только читал состояние системы и ничего не менял."
} > "$OUTPUT"
