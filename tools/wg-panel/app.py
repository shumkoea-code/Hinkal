#!/usr/bin/env python3
"""WireGuard admin panel — secret URL, 2FA, peer limits/stats, share links."""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import re
import secrets
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from io import BytesIO
from pathlib import Path

from werkzeug.middleware.proxy_fix import ProxyFix
from flask import (
    Flask,
    abort,
    flash,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)

try:
    import qrcode
except ImportError:
    qrcode = None

try:
    import pyotp
except ImportError:
    pyotp = None

APP_DIR = Path(os.environ.get("WG_PANEL_DIR", "/opt/wg-panel"))
DB_PATH = Path(os.environ.get("WG_PANEL_DB", str(APP_DIR / "panel.db")))
WG_CONF = Path(os.environ.get("WG_CONF", "/etc/wireguard/wg0.conf"))
WG_IFACE = os.environ.get("WG_IFACE", "wg0")
SERVER_VPN_IP = os.environ.get("WG_SERVER_VPN_IP", "10.0.8.1")
SUBNET = os.environ.get("WG_SUBNET", "10.0.8.0/24")
AUDIT_DB = Path(os.environ.get("WG_AUDIT_DB", "/var/lib/wg-audit/audit.db"))
SECRET_FILE = APP_DIR / "secret_key"
ADMIN_BOOTSTRAP = APP_DIR / "admin.bootstrap"
ADMIN_PATH_FILE = APP_DIR / "admin_path"
PUBLIC_BASE = os.environ.get("WG_PUBLIC_BASE", "https://v1.idivles.ru:8447").rstrip("/")
NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{2,32}$")
DEFAULTS = {
    "endpoint": os.environ.get("WG_ENDPOINT", "77.110.125.241:51820"),
    "client_dns": os.environ.get("WG_CLIENT_DNS", "10.0.8.1"),
    "client_mtu": os.environ.get("WG_CLIENT_MTU", "1280"),
    "keepalive": os.environ.get("WG_KEEPALIVE", "25"),
    "allowed_ips": os.environ.get("WG_ALLOWED_IPS", "0.0.0.0/0, ::/0"),
    "ban_after": os.environ.get("WG_BAN_AFTER", "2"),
    "ban_seconds": os.environ.get("WG_BAN_SECONDS", "3600"),
}

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["PREFERRED_URL_SCHEME"] = "https"


# --- path / dirs -----------------------------------------------------------------

def _ensure_dirs() -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    (APP_DIR / "peers").mkdir(parents=True, exist_ok=True)


def _load_secret() -> str:
    _ensure_dirs()
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text().strip()
    secret = secrets.token_hex(32)
    SECRET_FILE.write_text(secret)
    SECRET_FILE.chmod(0o600)
    return secret


app.secret_key = _load_secret()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=True,
    PERMANENT_SESSION_LIFETIME=3600 * 8,
)


def db() -> sqlite3.Connection:
    _ensure_dirs()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def _column_exists(con: sqlite3.Connection, table: str, column: str) -> bool:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in rows)


def _add_column(con: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    if not _column_exists(con, table, column):
        con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def init_db() -> None:
    con = db()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS admin (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          username TEXT NOT NULL,
          pwd_hash TEXT NOT NULL,
          pwd_salt TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bans (
          ip TEXT PRIMARY KEY,
          until_ts INTEGER NOT NULL,
          reason TEXT
        );
        CREATE TABLE IF NOT EXISTS login_fails (
          ip TEXT PRIMARY KEY,
          fails INTEGER NOT NULL,
          window_start INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS peers (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          vpn_ip TEXT NOT NULL UNIQUE,
          public_key TEXT NOT NULL UNIQUE,
          private_key TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          note TEXT
        );
        CREATE TABLE IF NOT EXISTS share_tokens (
          token TEXT PRIMARY KEY,
          peer_id INTEGER NOT NULL REFERENCES peers(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          max_uses INTEGER NOT NULL DEFAULT 3,
          uses INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        """
    )
    for col, decl in [
        ("totp_secret", "TEXT"),
        ("totp_enabled", "INTEGER NOT NULL DEFAULT 0"),
    ]:
        _add_column(con, "admin", col, decl)
    for col, decl in [
        ("dns", "TEXT"),
        ("mtu", "INTEGER"),
        ("keepalive", "INTEGER"),
        ("allowed_ips", "TEXT"),
        ("traffic_limit_bytes", "INTEGER"),
        ("expires_at", "INTEGER"),
        ("rx_total", "INTEGER NOT NULL DEFAULT 0"),
        ("tx_total", "INTEGER NOT NULL DEFAULT 0"),
        ("rx_last", "INTEGER NOT NULL DEFAULT 0"),
        ("tx_last", "INTEGER NOT NULL DEFAULT 0"),
        ("disabled_reason", "TEXT"),
    ]:
        _add_column(con, "peers", col, decl)
    con.commit()
    con.close()


def get_setting(key: str, default: str | None = None) -> str:
    con = db()
    row = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    con.close()
    if row:
        return row["value"]
    if default is not None:
        return default
    return DEFAULTS.get(key, "")


def set_setting(key: str, value: str) -> None:
    con = db()
    con.execute(
        "INSERT INTO settings(key, value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    con.commit()
    con.close()


def ensure_admin_path() -> str:
    path = get_setting("admin_path", "")
    if path and re.fullmatch(r"[A-Za-z0-9_\-]{32,96}", path):
        ADMIN_PATH_FILE.write_text(path + "\n")
        ADMIN_PATH_FILE.chmod(0o600)
        return path
    path = secrets.token_urlsafe(48)
    set_setting("admin_path", path)
    ADMIN_PATH_FILE.write_text(path + "\n")
    ADMIN_PATH_FILE.chmod(0o600)
    return path


def admin_prefix() -> str:
    return "/" + ensure_admin_path()


def admin_public_url(extra: str = "") -> str:
    base = f"{PUBLIC_BASE}{admin_prefix()}"
    if not extra:
        return base + "/"
    if not extra.startswith("/"):
        extra = "/" + extra
    return base + extra


def write_bootstrap(user: str, password: str | None = None) -> None:
    lines = [
        f"username={user}",
        f"admin_url={admin_public_url('/login')}",
        f"admin_path={ensure_admin_path()}",
        f"created={datetime.now(timezone.utc).isoformat()}",
    ]
    if password:
        lines.insert(1, f"password={password}")
    lines.append("Delete this file after saving credentials.")
    ADMIN_BOOTSTRAP.write_text("\n".join(lines) + "\n")
    ADMIN_BOOTSTRAP.chmod(0o600)


class AdminPathMiddleware:
    """Only /<long-secret>/… and /s/… are reachable; everything else → 404."""

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "") or "/"
        if path.startswith("/s/") or path == "/s":
            return self.wsgi_app(environ, start_response)
        if path.startswith("/static/"):
            return self.wsgi_app(environ, start_response)
        prefix = admin_prefix()
        if path == prefix or path.startswith(prefix + "/"):
            environ["SCRIPT_NAME"] = (environ.get("SCRIPT_NAME") or "") + prefix
            environ["PATH_INFO"] = path[len(prefix) :] or "/"
            return self.wsgi_app(environ, start_response)
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"]


app.wsgi_app = AdminPathMiddleware(app.wsgi_app)


# --- crypto / auth ---------------------------------------------------------------

def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return digest.hex(), salt


def verify_password(password: str, pwd_hash: str, salt: str) -> bool:
    digest, _ = hash_password(password, salt)
    return hmac.compare_digest(digest, pwd_hash)


def client_ip() -> str:
    xri = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    if xri:
        try:
            ipaddress.ip_address(xri)
            return xri
        except ValueError:
            pass
    return request.remote_addr or "0.0.0.0"


def ban_after() -> int:
    return max(1, int(get_setting("ban_after", DEFAULTS["ban_after"])))


def ban_seconds() -> int:
    return max(60, int(get_setting("ban_seconds", DEFAULTS["ban_seconds"])))


def is_banned(ip: str) -> bool:
    con = db()
    row = con.execute("SELECT until_ts FROM bans WHERE ip=?", (ip,)).fetchone()
    con.close()
    if not row:
        return False
    if row["until_ts"] <= int(time.time()):
        con = db()
        con.execute("DELETE FROM bans WHERE ip=?", (ip,))
        con.commit()
        con.close()
        return False
    return True


def ban_ip(ip: str, reason: str = "login") -> None:
    until_ts = int(time.time()) + ban_seconds()
    con = db()
    con.execute(
        "INSERT INTO bans(ip, until_ts, reason) VALUES(?,?,?) "
        "ON CONFLICT(ip) DO UPDATE SET until_ts=excluded.until_ts, reason=excluded.reason",
        (ip, until_ts, reason),
    )
    con.execute("DELETE FROM login_fails WHERE ip=?", (ip,))
    con.commit()
    con.close()


def register_fail(ip: str) -> int:
    now = int(time.time())
    window = ban_seconds()
    con = db()
    row = con.execute("SELECT fails, window_start FROM login_fails WHERE ip=?", (ip,)).fetchone()
    if not row or now - row["window_start"] > window:
        fails = 1
        con.execute(
            "INSERT INTO login_fails(ip, fails, window_start) VALUES(?,?,?) "
            "ON CONFLICT(ip) DO UPDATE SET fails=1, window_start=excluded.window_start",
            (ip, fails, now),
        )
    else:
        fails = int(row["fails"]) + 1
        con.execute("UPDATE login_fails SET fails=? WHERE ip=?", (fails, ip))
    con.commit()
    con.close()
    if fails >= ban_after():
        ban_ip(ip, "too many login failures")
    return fails


def clear_fails(ip: str) -> None:
    con = db()
    con.execute("DELETE FROM login_fails WHERE ip=?", (ip,))
    con.commit()
    con.close()


def ensure_admin() -> None:
    con = db()
    row = con.execute("SELECT id, username FROM admin WHERE id=1").fetchone()
    if row:
        con.close()
        ensure_admin_path()
        _upsert_bootstrap_meta(row["username"])
        return
    user = os.environ.get("WG_ADMIN_USER", "admin")
    password = os.environ.get("WG_ADMIN_PASSWORD") or secrets.token_urlsafe(18)
    pwd_hash, salt = hash_password(password)
    now = int(time.time())
    con.execute(
        "INSERT INTO admin(id, username, pwd_hash, pwd_salt, created_at, totp_enabled) VALUES(1,?,?,?,?,0)",
        (user, pwd_hash, salt, now),
    )
    con.commit()
    con.close()
    ensure_admin_path()
    write_bootstrap(user, password)


def _upsert_bootstrap_meta(username: str) -> None:
    """Keep admin_url/path fresh without wiping an existing password line."""
    path = ensure_admin_path()
    url = admin_public_url("/login")
    if not ADMIN_BOOTSTRAP.exists():
        write_bootstrap(username)
        return
    lines = ADMIN_BOOTSTRAP.read_text().splitlines()
    out = []
    seen = set()
    for line in lines:
        if line.startswith("admin_url="):
            out.append(f"admin_url={url}")
            seen.add("admin_url")
        elif line.startswith("admin_path="):
            out.append(f"admin_path={path}")
            seen.add("admin_path")
        elif line.startswith("username="):
            out.append(f"username={username}")
            seen.add("username")
        else:
            out.append(line)
    if "admin_url" not in seen:
        out.insert(1, f"admin_url={url}")
    if "admin_path" not in seen:
        out.insert(2, f"admin_path={path}")
    ADMIN_BOOTSTRAP.write_text("\n".join(out).rstrip() + "\n")
    ADMIN_BOOTSTRAP.chmod(0o600)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        ip = client_ip()
        if is_banned(ip):
            abort(403, description="IP временно заблокирован. Попробуйте через час.")
        if not session.get("admin"):
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)

    return wrapper


# --- helpers ---------------------------------------------------------------------

def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "command failed").strip())
    return (p.stdout or "").strip()


def server_public_key() -> str:
    return run(["wg", "show", WG_IFACE, "public-key"])


def human_bytes(n: int | None) -> str:
    if n is None:
        return "∞"
    n = int(n)
    units = ["B", "KB", "MB", "GB", "TB"]
    f = float(n)
    for u in units:
        if f < 1024 or u == units[-1]:
            return f"{f:.1f} {u}" if u != "B" else f"{int(f)} B"
        f /= 1024
    return f"{n} B"


def human_ago(seconds: int | None) -> str:
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{seconds}с"
    if seconds < 3600:
        return f"{seconds // 60}м"
    if seconds < 86400:
        return f"{seconds // 3600}ч"
    return f"{seconds // 86400}д"


def human_ts(ts: int | None) -> str:
    if not ts:
        return "бессрочно"
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%d.%m.%Y %H:%M UTC")


def add_calendar_months(ts: int, months: int) -> int:
    """Add calendar months to unix timestamp (UTC)."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    month0 = dt.month - 1 + int(months)
    year = dt.year + month0 // 12
    month = month0 % 12 + 1
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    last_day = (next_month - timedelta(days=1)).day
    day = min(dt.day, last_day)
    return int(
        datetime(year, month, day, dt.hour, dt.minute, dt.second, tzinfo=timezone.utc).timestamp()
    )


DURATION_PRESETS = {
    "1m": (1, "1 месяц"),
    "3m": (3, "3 месяца"),
    "6m": (6, "6 месяцев"),
    "12m": (12, "12 месяцев"),
    "24m": (24, "24 месяца"),
}


def parse_expiry_from_form(form, *, base_ts: int | None = None, stack: bool = False) -> int | None:
    """
    duration_preset: forever | 1m | 3m | 6m | 12m | 24m | custom
    expires_days: used when custom
    Returns unix expires_at, or None for unlimited.
    If stack=True, months/days add on top of max(now, base_ts).
    """
    preset = (form.get("duration_preset") or "").strip()
    now = int(time.time())
    if preset in ("", "forever"):
        if stack:
            # renew with forever → clear expiry
            return None
        return None
    start = now
    if stack and base_ts and int(base_ts) > now:
        start = int(base_ts)
    if preset in DURATION_PRESETS:
        months, _ = DURATION_PRESETS[preset]
        return add_calendar_months(start, months)
    if preset == "custom":
        days = (form.get("expires_days") or "").strip()
        if not days:
            raise ValueError("Укажите число дней для своего срока")
        return start + int(days) * 86400
    # legacy: expires_days alone
    days = (form.get("expires_days") or "").strip()
    if days:
        return start + int(days) * 86400
    return None


def next_vpn_ip() -> str:
    net = ipaddress.ip_network(SUBNET)
    used = {SERVER_VPN_IP}
    con = db()
    for row in con.execute("SELECT vpn_ip FROM peers"):
        used.add(row["vpn_ip"])
    con.close()
    for host in net.hosts():
        ip = str(host)
        if int(ip.split(".")[-1]) < 2:
            continue
        if ip not in used:
            return ip
    raise RuntimeError("Нет свободных IP в подсети WG")


def gen_keypair() -> tuple[str, str]:
    priv = run(["wg", "genkey"])
    p = subprocess.run(["wg", "pubkey"], input=priv + "\n", capture_output=True, text=True, check=True)
    return priv, p.stdout.strip()


def peer_field(peer, key: str, setting_key: str | None = None, default: str = "") -> str:
    val = peer[key] if peer and peer[key] not in (None, "") else None
    if val is not None:
        return str(val)
    if setting_key:
        return get_setting(setting_key, default)
    return default


def client_conf_text(peer) -> str:
    dns = peer_field(peer, "dns", "client_dns", DEFAULTS["client_dns"])
    mtu = peer_field(peer, "mtu", "client_mtu", DEFAULTS["client_mtu"])
    keepalive = peer_field(peer, "keepalive", "keepalive", DEFAULTS["keepalive"])
    allowed = peer_field(peer, "allowed_ips", "allowed_ips", DEFAULTS["allowed_ips"])
    endpoint = get_setting("endpoint", DEFAULTS["endpoint"])
    return (
        f"[Interface]\n"
        f"PrivateKey = {peer['private_key']}\n"
        f"Address = {peer['vpn_ip']}/32\n"
        f"DNS = {dns}\n"
        f"MTU = {mtu}\n\n"
        f"[Peer]\n"
        f"PublicKey = {server_public_key()}\n"
        f"Endpoint = {endpoint}\n"
        f"AllowedIPs = {allowed}\n"
        f"PersistentKeepalive = {keepalive}\n"
    )


def persist_wg_conf() -> None:
    priv = None
    if WG_CONF.exists():
        for line in WG_CONF.read_text().splitlines():
            if line.strip().startswith("PrivateKey"):
                priv = line.split("=", 1)[1].strip()
                break
    if not priv:
        raise RuntimeError("Не найден PrivateKey сервера в wg0.conf")
    wan = run(["bash", "-lc", "ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i==\"dev\"){print $(i+1); exit}}'"])
    listen = get_setting("endpoint", DEFAULTS["endpoint"]).split(":")[-1] or "51820"
    try:
        listen_port = int(listen)
    except ValueError:
        listen_port = 51820
    lines = [
        "[Interface]",
        f"PrivateKey = {priv}",
        f"Address = {SERVER_VPN_IP}/24",
        f"ListenPort = {listen_port}",
        f"PostUp = iptables -A FORWARD -i {WG_IFACE} -j ACCEPT; iptables -A FORWARD -o {WG_IFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -s {SUBNET} -o {wan} -j MASQUERADE",
        f"PostDown = iptables -D FORWARD -i {WG_IFACE} -j ACCEPT; iptables -D FORWARD -o {WG_IFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -s {SUBNET} -o {wan} -j MASQUERADE",
        "",
    ]
    con = db()
    peers = con.execute("SELECT name, vpn_ip, public_key, enabled FROM peers ORDER BY id").fetchall()
    con.close()
    for p in peers:
        if not p["enabled"]:
            continue
        lines += [
            "[Peer]",
            f"# {p['name']}",
            f"PublicKey = {p['public_key']}",
            f"AllowedIPs = {p['vpn_ip']}/32",
            "",
        ]
    backup = WG_CONF.with_suffix(WG_CONF.suffix + f".bak.panel.{int(time.time())}")
    if WG_CONF.exists():
        backup.write_text(WG_CONF.read_text())
    WG_CONF.write_text("\n".join(lines) + "\n")
    WG_CONF.chmod(0o600)
    strip = subprocess.run(["wg-quick", "strip", WG_IFACE], capture_output=True, text=True, check=True)
    fd, tmp_path = tempfile.mkstemp(prefix="wg-sync-", suffix=".conf")
    try:
        with os.fdopen(fd, "w") as tmp:
            tmp.write(strip.stdout)
        subprocess.run(["wg", "syncconf", WG_IFACE, tmp_path], check=True, capture_output=True, text=True)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def sync_existing_disk_peers() -> None:
    con = db()
    count = con.execute("SELECT COUNT(*) AS c FROM peers").fetchone()["c"]
    con.close()
    if count:
        return
    mapping = [
        ("keenetic", "10.0.8.2", "/root/keenetic-wg/keenetic-client.conf"),
        ("mikrotik", "10.0.8.3", "/root/keenetic-wg/mikrotik-client.conf"),
    ]
    for name, ip, path in mapping:
        p = Path(path)
        if not p.exists():
            continue
        text = p.read_text()
        priv = None
        for line in text.splitlines():
            if line.startswith("PrivateKey"):
                priv = line.split("=", 1)[1].strip()
        if not priv:
            continue
        pub = subprocess.run(["wg", "pubkey"], input=priv + "\n", capture_output=True, text=True, check=True).stdout.strip()
        con = db()
        try:
            con.execute(
                "INSERT INTO peers(name, vpn_ip, public_key, private_key, created_at, enabled, note) VALUES(?,?,?,?,?,?,?)",
                (name, ip, pub, priv, int(time.time()), 1, "imported"),
            )
            con.commit()
        except sqlite3.IntegrityError:
            pass
        con.close()
        (APP_DIR / "peers" / f"{name}.conf").write_text(text)
        (APP_DIR / "peers" / f"{name}.conf").chmod(0o600)


def wg_runtime() -> list[dict]:
    out = run(["wg", "show", WG_IFACE, "dump"])
    rows = []
    for line in out.splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 8:
            continue
        rows.append(
            {
                "public_key": parts[0],
                "endpoint": parts[2] if parts[2] != "(none)" else "",
                "allowed": parts[3],
                "handshake": int(parts[4] or 0),
                "rx": int(parts[5] or 0),
                "tx": int(parts[6] or 0),
            }
        )
    return rows


def update_traffic_and_limits() -> None:
    """Accumulate traffic across counter resets; auto-disable by limit/expiry."""
    now = int(time.time())
    runtime = {r["public_key"]: r for r in wg_runtime()}
    con = db()
    peers = con.execute("SELECT * FROM peers").fetchall()
    changed = False
    for p in peers:
        rt = runtime.get(p["public_key"])
        rx_cur = rt["rx"] if rt else 0
        tx_cur = rt["tx"] if rt else 0
        rx_last = int(p["rx_last"] or 0)
        tx_last = int(p["tx_last"] or 0)
        rx_total = int(p["rx_total"] or 0)
        tx_total = int(p["tx_total"] or 0)
        if rx_cur >= rx_last:
            rx_total += rx_cur - rx_last
        else:
            rx_total += rx_cur
        if tx_cur >= tx_last:
            tx_total += tx_cur - tx_last
        else:
            tx_total += tx_cur
        con.execute(
            "UPDATE peers SET rx_total=?, tx_total=?, rx_last=?, tx_last=? WHERE id=?",
            (rx_total, tx_total, rx_cur, tx_cur, p["id"]),
        )
        reason = None
        if p["enabled"]:
            if p["expires_at"] and int(p["expires_at"]) <= now:
                reason = "expired"
            lim = p["traffic_limit_bytes"]
            if lim is not None and int(lim) > 0 and (rx_total + tx_total) >= int(lim):
                reason = "traffic_limit"
        if reason:
            con.execute(
                "UPDATE peers SET enabled=0, disabled_reason=? WHERE id=?",
                (reason, p["id"]),
            )
            changed = True
    con.commit()
    con.close()
    if changed:
        try:
            persist_wg_conf()
        except Exception:
            pass


def audit_summary(limit: int = 15) -> list[dict]:
    if not AUDIT_DB.exists():
        return []
    try:
        con = sqlite3.connect(AUDIT_DB)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT id AS rid, value, hits FROM resources ORDER BY hits DESC LIMIT ?",
            (limit,),
        ).fetchall()
        con.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def share_public_url(token: str) -> str:
    return f"{PUBLIC_BASE}/s/{token}/page"


def save_peer_conf_file(peer) -> None:
    conf = client_conf_text(peer)
    path = APP_DIR / "peers" / f"{peer['name']}.conf"
    path.write_text(conf)
    path.chmod(0o600)


# --- request hooks ---------------------------------------------------------------

@app.before_request
def _ban_gate():
    if request.endpoint == "static":
        return
    # share pages still respect bans? leave open for users; only gate admin via login_required
    if request.path.startswith("/s"):
        return
    if is_banned(client_ip()) and request.endpoint not in ("login", "login_2fa"):
        abort(403, description="IP заблокирован на 1 час после ошибок входа.")


@app.context_processor
def _inject_globals():
    return {
        "human_bytes": human_bytes,
        "human_ago": human_ago,
        "human_ts": human_ts,
        "admin_url": admin_public_url,
        "public_base": PUBLIC_BASE,
        "duration_presets": DURATION_PRESETS,
    }


# --- auth routes -----------------------------------------------------------------

@app.route("/login", methods=["GET", "POST"])
def login():
    ip = client_ip()
    if is_banned(ip):
        abort(403, description="IP заблокирован на 1 час.")
    err = None
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        con = db()
        row = con.execute(
            "SELECT username, pwd_hash, pwd_salt, totp_enabled, totp_secret FROM admin WHERE id=1"
        ).fetchone()
        con.close()
        ok = bool(row) and username == row["username"] and verify_password(password, row["pwd_hash"], row["pwd_salt"])
        if ok:
            clear_fails(ip)
            if row["totp_enabled"] and row["totp_secret"]:
                session.clear()
                session["pending_2fa"] = True
                session["pending_user"] = username
                session.permanent = True
                return redirect(url_for("login_2fa", next=request.args.get("next") or "/"))
            session.clear()
            session["admin"] = True
            session["user"] = username
            session.permanent = True
            return redirect(request.args.get("next") or url_for("dashboard"))
        fails = register_fail(ip)
        left = max(0, ban_after() - fails)
        err = (
            "Слишком много ошибок. IP заблокирован на 1 час."
            if left == 0
            else f"Неверный логин или пароль. Осталось попыток: {left}"
        )
    return render_template("login.html", error=err, ban_after=ban_after())


@app.route("/login/2fa", methods=["GET", "POST"])
def login_2fa():
    ip = client_ip()
    if is_banned(ip):
        abort(403, description="IP заблокирован на 1 час.")
    if not session.get("pending_2fa"):
        return redirect(url_for("login"))
    err = None
    if request.method == "POST":
        code = (request.form.get("code") or "").strip().replace(" ", "")
        con = db()
        row = con.execute("SELECT username, totp_secret, totp_enabled FROM admin WHERE id=1").fetchone()
        con.close()
        valid = False
        if pyotp and row and row["totp_enabled"] and row["totp_secret"]:
            valid = pyotp.TOTP(row["totp_secret"]).verify(code, valid_window=1)
        if valid:
            clear_fails(ip)
            user = session.get("pending_user") or row["username"]
            session.clear()
            session["admin"] = True
            session["user"] = user
            session.permanent = True
            return redirect(request.args.get("next") or url_for("dashboard"))
        fails = register_fail(ip)
        left = max(0, ban_after() - fails)
        err = "Неверный код 2FA." + (f" Осталось: {left}" if left else " IP заблокирован.")
    return render_template("login_2fa.html", error=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# --- dashboard / peers -----------------------------------------------------------

@app.route("/")
@login_required
def dashboard():
    try:
        update_traffic_and_limits()
    except Exception:
        pass
    con = db()
    peers = [dict(r) for r in con.execute("SELECT * FROM peers ORDER BY id").fetchall()]
    bans = [dict(r) for r in con.execute("SELECT * FROM bans ORDER BY until_ts DESC").fetchall()]
    con.close()
    runtime = {r["public_key"]: r for r in wg_runtime()}
    now = int(time.time())
    total_rx = total_tx = online = 0
    for p in peers:
        rt = runtime.get(p["public_key"], {})
        p["endpoint"] = rt.get("endpoint", "")
        p["rx_live"] = rt.get("rx", 0)
        p["tx_live"] = rt.get("tx", 0)
        p["rx"] = int(p.get("rx_total") or 0)
        p["tx"] = int(p.get("tx_total") or 0)
        hs = rt.get("handshake", 0)
        p["handshake_ago"] = (now - hs) if hs else None
        p["online"] = bool(hs and (now - hs) < 180)
        if p["online"]:
            online += 1
        total_rx += p["rx"]
        total_tx += p["tx"]
        lim = p.get("traffic_limit_bytes")
        used = p["rx"] + p["tx"]
        p["usage_pct"] = min(100, int(used * 100 / lim)) if lim else None
        p["limit_label"] = human_bytes(lim) if lim else "без лимита"
        p["used_label"] = human_bytes(used)
        exp = p.get("expires_at")
        p["expires_label"] = human_ts(exp)
        if exp:
            left = int(exp) - now
            p["expires_left"] = left
            p["expires_soon"] = 0 < left < 7 * 86400
            p["expired"] = left <= 0
        else:
            p["expires_left"] = None
            p["expires_soon"] = False
            p["expired"] = False
    return render_template(
        "dashboard.html",
        peers=peers,
        bans=bans,
        now=now,
        endpoint=get_setting("endpoint", DEFAULTS["endpoint"]),
        audit=audit_summary(),
        ban_after=ban_after(),
        ban_seconds=ban_seconds(),
        stats={
            "peers": len(peers),
            "enabled": sum(1 for p in peers if p["enabled"]),
            "online": online,
            "rx": total_rx,
            "tx": total_tx,
        },
    )


@app.route("/peers/create", methods=["POST"])
@login_required
def peers_create():
    name = (request.form.get("name") or "").strip()
    note = (request.form.get("note") or "").strip()
    if not NAME_RE.match(name):
        flash("Имя: 2–32 символа [a-zA-Z0-9_-]", "error")
        return redirect(url_for("dashboard"))
    traffic_gb = (request.form.get("traffic_gb") or "").strip()
    traffic_limit = None
    try:
        if traffic_gb:
            traffic_limit = int(float(traffic_gb) * 1024 * 1024 * 1024)
        expires_at = parse_expiry_from_form(request.form, stack=False)
    except ValueError as e:
        flash(str(e), "error")
        return redirect(url_for("dashboard"))
    peer_id = None
    vpn_ip = None
    try:
        vpn_ip = next_vpn_ip()
        priv, pub = gen_keypair()
        con = db()
        cur = con.execute(
            """
            INSERT INTO peers(
              name, vpn_ip, public_key, private_key, created_at, enabled, note,
              dns, mtu, keepalive, allowed_ips, traffic_limit_bytes, expires_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                name,
                vpn_ip,
                pub,
                priv,
                int(time.time()),
                1,
                note,
                get_setting("client_dns", DEFAULTS["client_dns"]),
                int(get_setting("client_mtu", DEFAULTS["client_mtu"])),
                int(get_setting("keepalive", DEFAULTS["keepalive"])),
                get_setting("allowed_ips", DEFAULTS["allowed_ips"]),
                traffic_limit,
                expires_at,
            ),
        )
        peer_id = cur.lastrowid
        con.commit()
        peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
        con.close()
        save_peer_conf_file(peer)
    except Exception as e:
        flash(f"Ошибка создания: {e}", "error")
        return redirect(url_for("dashboard"))
    try:
        persist_wg_conf()
        flash(f"Пир «{name}» создан ({vpn_ip}) и синхронизирован.", "ok")
    except Exception as e:
        flash(f"Пир создан, sync: {e}. Нажмите «Синхронизировать».", "error")
    return redirect(url_for("peer_detail", peer_id=peer_id))


@app.route("/peers/sync", methods=["POST"])
@login_required
def peers_sync():
    try:
        update_traffic_and_limits()
        persist_wg_conf()
        flash("Конфиг wg0 синхронизирован.", "ok")
    except Exception as e:
        flash(f"Sync ошибка: {e}", "error")
    return redirect(url_for("dashboard"))


@app.route("/peers/<int:peer_id>")
@login_required
def peer_detail(peer_id: int):
    try:
        update_traffic_and_limits()
    except Exception:
        pass
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    tokens = con.execute(
        "SELECT * FROM share_tokens WHERE peer_id=? ORDER BY created_at DESC", (peer_id,)
    ).fetchall()
    con.close()
    if not peer:
        abort(404)
    peer_d = dict(peer)
    runtime = {r["public_key"]: r for r in wg_runtime()}
    rt = runtime.get(peer["public_key"], {})
    now = int(time.time())
    hs = rt.get("handshake", 0)
    peer_d["endpoint"] = rt.get("endpoint", "")
    peer_d["handshake_ago"] = (now - hs) if hs else None
    peer_d["online"] = bool(hs and (now - hs) < 180)
    peer_d["rx"] = int(peer_d.get("rx_total") or 0)
    peer_d["tx"] = int(peer_d.get("tx_total") or 0)
    exp = peer_d.get("expires_at")
    peer_d["expires_label"] = human_ts(exp)
    if exp:
        left = int(exp) - now
        peer_d["expires_left"] = left
        peer_d["expires_soon"] = 0 < left < 7 * 86400
        peer_d["expired"] = left <= 0
    else:
        peer_d["expires_left"] = None
        peer_d["expires_soon"] = False
        peer_d["expired"] = False
    conf = client_conf_text(peer)
    share = request.args.get("share")
    return render_template(
        "peer.html",
        peer=peer_d,
        conf=conf,
        tokens=tokens,
        now=now,
        share=share,
        share_url=share_public_url(share) if share else None,
        defaults=DEFAULTS,
        settings={
            "client_dns": get_setting("client_dns", DEFAULTS["client_dns"]),
            "client_mtu": get_setting("client_mtu", DEFAULTS["client_mtu"]),
            "keepalive": get_setting("keepalive", DEFAULTS["keepalive"]),
            "allowed_ips": get_setting("allowed_ips", DEFAULTS["allowed_ips"]),
        },
    )


@app.route("/peers/<int:peer_id>/update", methods=["POST"])
@login_required
def peer_update(peer_id: int):
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    if not peer:
        con.close()
        abort(404)
    note = (request.form.get("note") or "").strip()
    dns = (request.form.get("dns") or "").strip() or None
    allowed_ips = (request.form.get("allowed_ips") or "").strip() or None
    try:
        mtu = int(request.form.get("mtu")) if request.form.get("mtu") else None
        keepalive = int(request.form.get("keepalive")) if request.form.get("keepalive") else None
        traffic_gb = (request.form.get("traffic_gb") or "").strip()
        traffic_limit = int(float(traffic_gb) * 1024**3) if traffic_gb else None
        clear_limit = request.form.get("clear_limit") == "1"
        clear_expiry = request.form.get("clear_expiry") == "1"
        if clear_limit:
            traffic_limit = None
        elif not traffic_gb:
            traffic_limit = peer["traffic_limit_bytes"]
        if clear_expiry:
            expires_at = None
        elif (request.form.get("duration_preset") or "").strip() in ("", "keep"):
            expires_at = peer["expires_at"]
        else:
            # set absolute new period from now (not stack) when editing "срок"
            expires_at = parse_expiry_from_form(request.form, stack=False)
    except ValueError as e:
        con.close()
        flash(str(e), "error")
        return redirect(url_for("peer_detail", peer_id=peer_id))
    con.execute(
        """
        UPDATE peers SET note=?, dns=?, mtu=?, keepalive=?, allowed_ips=?,
          traffic_limit_bytes=?, expires_at=? WHERE id=?
        """,
        (note, dns, mtu, keepalive, allowed_ips, traffic_limit, expires_at, peer_id),
    )
    con.commit()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    con.close()
    save_peer_conf_file(peer)
    flash("Настройки пира сохранены. Ключи не менялись — клиенту новый .conf не нужен (кроме DNS/MTU/AllowedIPs).", "ok")
    return redirect(url_for("peer_detail", peer_id=peer_id))


@app.route("/peers/<int:peer_id>/renew", methods=["POST"])
@login_required
def peer_renew(peer_id: int):
    """Extend subscription without changing keys/IP — same .conf keeps working."""
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    if not peer:
        con.close()
        abort(404)
    preset = (request.form.get("duration_preset") or "1m").strip()
    if preset == "forever":
        expires_at = None
        label = "бессрочно"
    else:
        try:
            # stack on remaining time if still active
            form = {"duration_preset": preset, "expires_days": request.form.get("expires_days")}
            expires_at = parse_expiry_from_form(form, base_ts=peer["expires_at"], stack=True)
        except ValueError as e:
            con.close()
            flash(str(e), "error")
            return redirect(url_for("peer_detail", peer_id=peer_id))
        if preset in DURATION_PRESETS:
            label = DURATION_PRESETS[preset][1]
        else:
            label = f"до {human_ts(expires_at)}"
    # Re-enable: same keys → client config unchanged, tunnel works again after sync
    con.execute(
        "UPDATE peers SET expires_at=?, enabled=1, disabled_reason=NULL WHERE id=?",
        (expires_at, peer_id),
    )
    con.commit()
    con.close()
    try:
        persist_wg_conf()
        flash(
            f"Продлено (+{label}). Ключи те же — пользователю ничего менять не нужно. "
            f"Новый срок: {human_ts(expires_at)}.",
            "ok",
        )
    except Exception as e:
        flash(f"Срок обновлён в БД, sync: {e}", "error")
    nxt = request.form.get("next") or url_for("peer_detail", peer_id=peer_id)
    return redirect(nxt)


@app.route("/peers/<int:peer_id>/download")
@login_required
def peer_download(peer_id: int):
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    con.close()
    if not peer:
        abort(404)
    conf = client_conf_text(peer)
    return send_file(
        BytesIO(conf.encode()),
        as_attachment=True,
        download_name=f"{peer['name']}.conf",
        mimetype="text/plain",
    )


@app.route("/peers/<int:peer_id>/qr.png")
@login_required
def peer_qr(peer_id: int):
    if qrcode is None:
        abort(500)
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    con.close()
    if not peer:
        abort(404)
    img = qrcode.make(client_conf_text(peer))
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/peers/<int:peer_id>/share", methods=["POST"])
@login_required
def peer_share(peer_id: int):
    hours = max(1, min(int(request.form.get("hours") or 24), 168))
    uses = max(1, min(int(request.form.get("uses") or 3), 20))
    con = db()
    if not con.execute("SELECT id FROM peers WHERE id=?", (peer_id,)).fetchone():
        con.close()
        abort(404)
    token = secrets.token_urlsafe(24)
    con.execute(
        "INSERT INTO share_tokens(token, peer_id, expires_at, max_uses, uses, created_at) VALUES(?,?,?,?,0,?)",
        (token, peer_id, int(time.time()) + hours * 3600, uses, int(time.time())),
    )
    con.commit()
    con.close()
    flash("Ссылка для раздачи создана.", "ok")
    return redirect(url_for("peer_detail", peer_id=peer_id, share=token))


@app.route("/peers/<int:peer_id>/toggle", methods=["POST"])
@login_required
def peer_toggle(peer_id: int):
    con = db()
    peer = con.execute("SELECT enabled FROM peers WHERE id=?", (peer_id,)).fetchone()
    if not peer:
        con.close()
        abort(404)
    new_val = 0 if peer["enabled"] else 1
    con.execute(
        "UPDATE peers SET enabled=?, disabled_reason=? WHERE id=?",
        (new_val, None if new_val else "manual", peer_id),
    )
    con.commit()
    con.close()
    try:
        persist_wg_conf()
        flash("Статус обновлён.", "ok")
    except Exception as e:
        flash(f"Ошибка sync: {e}", "error")
    nxt = request.form.get("next") or url_for("dashboard")
    return redirect(nxt)


@app.route("/peers/<int:peer_id>/delete", methods=["POST"])
@login_required
def peer_delete(peer_id: int):
    con = db()
    peer = con.execute("SELECT name FROM peers WHERE id=?", (peer_id,)).fetchone()
    if not peer:
        con.close()
        abort(404)
    con.execute("DELETE FROM share_tokens WHERE peer_id=?", (peer_id,))
    con.execute("DELETE FROM peers WHERE id=?", (peer_id,))
    con.commit()
    con.close()
    conf = APP_DIR / "peers" / f"{peer['name']}.conf"
    if conf.exists():
        conf.unlink()
    try:
        persist_wg_conf()
    except Exception as e:
        flash(f"Удалён, sync: {e}", "error")
        return redirect(url_for("dashboard"))
    flash(f"Пир «{peer['name']}» удалён.", "ok")
    return redirect(url_for("dashboard"))


@app.route("/peers/<int:peer_id>/reset-traffic", methods=["POST"])
@login_required
def peer_reset_traffic(peer_id: int):
    con = db()
    if not con.execute("SELECT id FROM peers WHERE id=?", (peer_id,)).fetchone():
        con.close()
        abort(404)
    con.execute(
        "UPDATE peers SET rx_total=0, tx_total=0, rx_last=0, tx_last=0, disabled_reason=NULL WHERE id=?",
        (peer_id,),
    )
    con.commit()
    con.close()
    flash("Счётчик трафика сброшен.", "ok")
    return redirect(url_for("peer_detail", peer_id=peer_id))


@app.route("/bans/<path:ip>/unban", methods=["POST"])
@login_required
def unban(ip: str):
    con = db()
    con.execute("DELETE FROM bans WHERE ip=?", (ip,))
    con.execute("DELETE FROM login_fails WHERE ip=?", (ip,))
    con.commit()
    con.close()
    flash(f"IP {ip} разблокирован.", "ok")
    return redirect(url_for("dashboard"))


# --- settings --------------------------------------------------------------------

@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings_page():
    con = db()
    admin = con.execute("SELECT username, totp_enabled, totp_secret FROM admin WHERE id=1").fetchone()
    con.close()
    totp_uri = None
    pending_secret = session.get("totp_pending_secret")
    if pending_secret and pyotp:
        totp_uri = pyotp.TOTP(pending_secret).provisioning_uri(name=admin["username"], issuer_name="WG Panel")

    if request.method == "POST":
        action = request.form.get("action") or ""
        if action == "defaults":
            for key in ("endpoint", "client_dns", "client_mtu", "keepalive", "allowed_ips", "ban_after", "ban_seconds"):
                val = (request.form.get(key) or "").strip()
                if val:
                    set_setting(key, val)
            flash("Параметры по умолчанию сохранены.", "ok")
            return redirect(url_for("settings_page"))

        if action == "password":
            cur = request.form.get("current_password") or ""
            new = request.form.get("new_password") or ""
            new2 = request.form.get("new_password2") or ""
            con = db()
            row = con.execute("SELECT pwd_hash, pwd_salt, username FROM admin WHERE id=1").fetchone()
            if not verify_password(cur, row["pwd_hash"], row["pwd_salt"]):
                con.close()
                flash("Текущий пароль неверен.", "error")
                return redirect(url_for("settings_page"))
            if len(new) < 10 or new != new2:
                con.close()
                flash("Новый пароль: минимум 10 символов, поля должны совпадать.", "error")
                return redirect(url_for("settings_page"))
            pwd_hash, salt = hash_password(new)
            con.execute("UPDATE admin SET pwd_hash=?, pwd_salt=? WHERE id=1", (pwd_hash, salt))
            con.commit()
            con.close()
            write_bootstrap(row["username"])  # without password
            flash("Пароль изменён.", "ok")
            return redirect(url_for("settings_page"))

        if action == "regen_path":
            cur = request.form.get("current_password") or ""
            con = db()
            row = con.execute("SELECT pwd_hash, pwd_salt, username FROM admin WHERE id=1").fetchone()
            con.close()
            if not verify_password(cur, row["pwd_hash"], row["pwd_salt"]):
                flash("Пароль неверен.", "error")
                return redirect(url_for("settings_page"))
            new_path = secrets.token_urlsafe(48)
            set_setting("admin_path", new_path)
            ADMIN_PATH_FILE.write_text(new_path + "\n")
            ADMIN_PATH_FILE.chmod(0o600)
            write_bootstrap(row["username"])
            session.clear()
            # middleware reads new path immediately
            flash("Секретный URL обновлён. Сохраните новую ссылку.", "ok")
            return redirect(f"/{new_path}/login")

        if action == "2fa_start":
            if not pyotp:
                flash("Модуль pyotp не установлен.", "error")
                return redirect(url_for("settings_page"))
            session["totp_pending_secret"] = pyotp.random_base32()
            flash("Отсканируйте QR и подтвердите кодом.", "ok")
            return redirect(url_for("settings_page"))

        if action == "2fa_confirm":
            code = (request.form.get("code") or "").strip()
            secret = session.get("totp_pending_secret")
            if not (pyotp and secret and pyotp.TOTP(secret).verify(code, valid_window=1)):
                flash("Неверный код подтверждения 2FA.", "error")
                return redirect(url_for("settings_page"))
            con = db()
            con.execute("UPDATE admin SET totp_secret=?, totp_enabled=1 WHERE id=1", (secret,))
            con.commit()
            con.close()
            session.pop("totp_pending_secret", None)
            flash("2FA включена.", "ok")
            return redirect(url_for("settings_page"))

        if action == "2fa_disable":
            cur = request.form.get("current_password") or ""
            code = (request.form.get("code") or "").strip()
            con = db()
            row = con.execute(
                "SELECT pwd_hash, pwd_salt, totp_secret FROM admin WHERE id=1"
            ).fetchone()
            ok_pw = verify_password(cur, row["pwd_hash"], row["pwd_salt"])
            ok_otp = pyotp and row["totp_secret"] and pyotp.TOTP(row["totp_secret"]).verify(code, valid_window=1)
            if not (ok_pw and ok_otp):
                con.close()
                flash("Нужны верный пароль и код 2FA.", "error")
                return redirect(url_for("settings_page"))
            con.execute("UPDATE admin SET totp_secret=NULL, totp_enabled=0 WHERE id=1")
            con.commit()
            con.close()
            flash("2FA отключена.", "ok")
            return redirect(url_for("settings_page"))

    totp_qr_data = None
    if totp_uri and qrcode:
        img = qrcode.make(totp_uri)
        buf = BytesIO()
        img.save(buf, format="PNG")
        import base64

        totp_qr_data = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return render_template(
        "settings.html",
        admin=admin,
        admin_path=ensure_admin_path(),
        admin_login_url=admin_public_url("/login"),
        settings={k: get_setting(k, DEFAULTS.get(k, "")) for k in DEFAULTS},
        totp_pending=bool(pending_secret),
        totp_qr_data=totp_qr_data,
        totp_secret=pending_secret,
        pyotp_ok=bool(pyotp),
    )


@app.route("/instructions")
@login_required
def instructions():
    return render_template(
        "instructions.html",
        endpoint=get_setting("endpoint", DEFAULTS["endpoint"]),
        admin_login_url=admin_public_url("/login"),
    )


# --- public share ----------------------------------------------------------------

@app.route("/s/<token>/page")
def share_page(token: str):
    con = db()
    row = con.execute("SELECT * FROM share_tokens WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < int(time.time()) or row["uses"] >= row["max_uses"]:
        con.close()
        abort(410)
    peer = con.execute("SELECT name, vpn_ip, enabled FROM peers WHERE id=?", (row["peer_id"],)).fetchone()
    left = row["max_uses"] - row["uses"]
    con.close()
    if not peer or not peer["enabled"]:
        abort(410)
    return render_template(
        "share.html",
        token=token,
        peer=peer,
        left=left,
        expires_at=row["expires_at"],
        now=int(time.time()),
    )


@app.route("/s/<token>")
def share_download(token: str):
    con = db()
    row = con.execute("SELECT * FROM share_tokens WHERE token=?", (token,)).fetchone()
    if not row:
        con.close()
        abort(404)
    if row["expires_at"] < int(time.time()) or row["uses"] >= row["max_uses"]:
        con.close()
        abort(410)
    peer = con.execute("SELECT * FROM peers WHERE id=?", (row["peer_id"],)).fetchone()
    if not peer or not peer["enabled"]:
        con.close()
        abort(404)
    con.execute("UPDATE share_tokens SET uses=uses+1 WHERE token=?", (token,))
    con.commit()
    con.close()
    conf = client_conf_text(peer)
    return send_file(
        BytesIO(conf.encode()),
        as_attachment=True,
        download_name=f"{peer['name']}.conf",
        mimetype="text/plain",
    )


@app.route("/s/<token>/qr.png")
def share_qr(token: str):
    con = db()
    row = con.execute("SELECT * FROM share_tokens WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < int(time.time()) or row["uses"] >= row["max_uses"]:
        con.close()
        abort(410)
    peer = con.execute("SELECT * FROM peers WHERE id=?", (row["peer_id"],)).fetchone()
    con.close()
    if not peer or not peer["enabled"] or qrcode is None:
        abort(404 if not peer else 500)
    img = qrcode.make(client_conf_text(peer))
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


def create_app() -> Flask:
    init_db()
    ensure_admin()
    for k, v in DEFAULTS.items():
        if not get_setting(k, ""):
            set_setting(k, v)
    sync_existing_disk_peers()
    return app


create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    try:
        from waitress import serve

        serve(app, host="127.0.0.1", port=port, threads=4, ident="wg-panel")
    except ImportError:
        app.run(host="127.0.0.1", port=port, debug=False)
