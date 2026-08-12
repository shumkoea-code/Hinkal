#!/usr/bin/env python3
"""WireGuard admin panel — create peers, distribute configs, audit summary."""
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
from datetime import datetime, timezone
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

APP_DIR = Path(os.environ.get("WG_PANEL_DIR", "/opt/wg-panel"))
DB_PATH = Path(os.environ.get("WG_PANEL_DB", str(APP_DIR / "panel.db")))
WG_CONF = Path(os.environ.get("WG_CONF", "/etc/wireguard/wg0.conf"))
WG_IFACE = os.environ.get("WG_IFACE", "wg0")
SERVER_ENDPOINT = os.environ.get("WG_ENDPOINT", "77.110.125.241:51820")
SERVER_VPN_IP = os.environ.get("WG_SERVER_VPN_IP", "10.0.8.1")
SUBNET = os.environ.get("WG_SUBNET", "10.0.8.0/24")
CLIENT_DNS = os.environ.get("WG_CLIENT_DNS", "10.0.8.1")
CLIENT_MTU = int(os.environ.get("WG_CLIENT_MTU", "1280"))
KEEPALIVE = int(os.environ.get("WG_KEEPALIVE", "25"))
BAN_AFTER = int(os.environ.get("WG_BAN_AFTER", "2"))
BAN_SECONDS = int(os.environ.get("WG_BAN_SECONDS", "3600"))
AUDIT_DB = Path(os.environ.get("WG_AUDIT_DB", "/var/lib/wg-audit/audit.db"))
SECRET_FILE = APP_DIR / "secret_key"
ADMIN_BOOTSTRAP = APP_DIR / "admin.bootstrap"
PUBLIC_BASE = os.environ.get("WG_PUBLIC_BASE", "https://v1.idivles.ru:8447").rstrip("/")
NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{2,32}$")

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["PREFERRED_URL_SCHEME"] = "https"


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
    con.commit()
    con.close()


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
    until_ts = int(time.time()) + BAN_SECONDS
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
    con = db()
    row = con.execute("SELECT fails, window_start FROM login_fails WHERE ip=?", (ip,)).fetchone()
    if not row or now - row["window_start"] > BAN_SECONDS:
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
    if fails >= BAN_AFTER:
        ban_ip(ip, "too many login failures")
    return fails


def clear_fails(ip: str) -> None:
    con = db()
    con.execute("DELETE FROM login_fails WHERE ip=?", (ip,))
    con.commit()
    con.close()


def ensure_admin() -> None:
    con = db()
    row = con.execute("SELECT id FROM admin WHERE id=1").fetchone()
    if row:
        con.close()
        return
    user = os.environ.get("WG_ADMIN_USER", "admin")
    password = os.environ.get("WG_ADMIN_PASSWORD") or secrets.token_urlsafe(18)
    pwd_hash, salt = hash_password(password)
    now = int(time.time())
    con.execute(
        "INSERT INTO admin(id, username, pwd_hash, pwd_salt, created_at) VALUES(1,?,?,?,?)",
        (user, pwd_hash, salt, now),
    )
    con.commit()
    con.close()
    ADMIN_BOOTSTRAP.write_text(
        f"username={user}\npassword={password}\ncreated={datetime.now(timezone.utc).isoformat()}\n"
        "Delete this file after saving the password.\n"
    )
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


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "command failed").strip())
    return (p.stdout or "").strip()


def server_public_key() -> str:
    return run(["wg", "show", WG_IFACE, "public-key"])


def next_vpn_ip() -> str:
    net = ipaddress.ip_network(SUBNET)
    used = {SERVER_VPN_IP}
    con = db()
    for row in con.execute("SELECT vpn_ip FROM peers"):
        used.add(row["vpn_ip"])
    con.close()
    for host in net.hosts():
        ip = str(host)
        last = int(ip.split(".")[-1])
        if last < 2:
            continue
        if ip not in used:
            return ip
    raise RuntimeError("Нет свободных IP в подсети WG")


def gen_keypair() -> tuple[str, str]:
    priv = run(["wg", "genkey"])
    p = subprocess.run(["wg", "pubkey"], input=priv + "\n", capture_output=True, text=True, check=True)
    return priv, p.stdout.strip()


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
    lines = [
        "[Interface]",
        f"PrivateKey = {priv}",
        f"Address = {SERVER_VPN_IP}/24",
        "ListenPort = 51820",
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
    # wg syncconf требует путь к файлу (не stdin)
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


def client_conf_text(name: str, private_key: str, vpn_ip: str) -> str:
    return (
        f"[Interface]\n"
        f"PrivateKey = {private_key}\n"
        f"Address = {vpn_ip}/32\n"
        f"DNS = {CLIENT_DNS}\n"
        f"MTU = {CLIENT_MTU}\n\n"
        f"[Peer]\n"
        f"PublicKey = {server_public_key()}\n"
        f"Endpoint = {SERVER_ENDPOINT}\n"
        f"AllowedIPs = 0.0.0.0/0, ::/0\n"
        f"PersistentKeepalive = {KEEPALIVE}\n"
    )


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
    lines = out.splitlines()
    for line in lines[1:]:
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


@app.before_request
def _ban_gate():
    if request.endpoint == "static":
        return
    if is_banned(client_ip()):
        abort(403, description="IP заблокирован на 1 час после ошибок входа.")


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
        row = con.execute("SELECT username, pwd_hash, pwd_salt FROM admin WHERE id=1").fetchone()
        con.close()
        ok = bool(row) and username == row["username"] and verify_password(password, row["pwd_hash"], row["pwd_salt"])
        if ok:
            clear_fails(ip)
            session.clear()
            session["admin"] = True
            session["user"] = username
            session.permanent = True
            return redirect(request.args.get("next") or url_for("dashboard"))
        fails = register_fail(ip)
        left = max(0, BAN_AFTER - fails)
        err = "Слишком много ошибок. IP заблокирован на 1 час." if left == 0 else f"Неверный логин или пароль. Осталось попыток: {left}"
    return render_template("login.html", error=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    con = db()
    peers = [dict(r) for r in con.execute("SELECT * FROM peers ORDER BY id").fetchall()]
    bans = [dict(r) for r in con.execute("SELECT * FROM bans ORDER BY until_ts DESC").fetchall()]
    con.close()
    runtime = {r["public_key"]: r for r in wg_runtime()}
    now = int(time.time())
    for p in peers:
        rt = runtime.get(p["public_key"], {})
        p["endpoint"] = rt.get("endpoint", "")
        p["rx"] = rt.get("rx", 0)
        p["tx"] = rt.get("tx", 0)
        hs = rt.get("handshake", 0)
        p["handshake_ago"] = (now - hs) if hs else None
    return render_template(
        "dashboard.html",
        peers=peers,
        bans=bans,
        now=now,
        endpoint=SERVER_ENDPOINT,
        audit=audit_summary(),
        ban_after=BAN_AFTER,
        ban_seconds=BAN_SECONDS,
    )


@app.route("/peers/create", methods=["POST"])
@login_required
def peers_create():
    name = (request.form.get("name") or "").strip()
    note = (request.form.get("note") or "").strip()
    if not NAME_RE.match(name):
        flash("Имя: 2–32 символа [a-zA-Z0-9_-]", "error")
        return redirect(url_for("dashboard"))
    peer_id = None
    try:
        vpn_ip = next_vpn_ip()
        priv, pub = gen_keypair()
        conf = client_conf_text(name, priv, vpn_ip)
        con = db()
        cur = con.execute(
            "INSERT INTO peers(name, vpn_ip, public_key, private_key, created_at, enabled, note) VALUES(?,?,?,?,?,?,?)",
            (name, vpn_ip, pub, priv, int(time.time()), 1, note),
        )
        peer_id = cur.lastrowid
        con.commit()
        con.close()
        (APP_DIR / "peers" / f"{name}.conf").write_text(conf)
        (APP_DIR / "peers" / f"{name}.conf").chmod(0o600)
    except Exception as e:
        flash(f"Ошибка создания: {e}", "error")
        return redirect(url_for("dashboard"))
    try:
        persist_wg_conf()
        flash(f"Пир «{name}» создан ({vpn_ip}) и синхронизирован с wg0.", "ok")
    except Exception as e:
        flash(f"Пир создан в БД, но sync wg0 не удался: {e}. Нажмите «Синхронизировать».", "error")
    return redirect(url_for("peer_detail", peer_id=peer_id))


@app.route("/peers/sync", methods=["POST"])
@login_required
def peers_sync():
    try:
        persist_wg_conf()
        flash("Конфиг wg0 синхронизирован.", "ok")
    except Exception as e:
        flash(f"Sync ошибка: {e}", "error")
    return redirect(url_for("dashboard"))


@app.route("/peers/<int:peer_id>")
@login_required
def peer_detail(peer_id: int):
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    tokens = con.execute(
        "SELECT * FROM share_tokens WHERE peer_id=? ORDER BY created_at DESC", (peer_id,)
    ).fetchall()
    con.close()
    if not peer:
        abort(404)
    conf = client_conf_text(peer["name"], peer["private_key"], peer["vpn_ip"])
    share = request.args.get("share")
    return render_template(
        "peer.html",
        peer=peer,
        conf=conf,
        tokens=tokens,
        now=int(time.time()),
        share=share,
        share_url=share_public_url(share) if share else None,
        public_base=PUBLIC_BASE,
    )


@app.route("/peers/<int:peer_id>/download")
@login_required
def peer_download(peer_id: int):
    con = db()
    peer = con.execute("SELECT * FROM peers WHERE id=?", (peer_id,)).fetchone()
    con.close()
    if not peer:
        abort(404)
    conf = client_conf_text(peer["name"], peer["private_key"], peer["vpn_ip"])
    return send_file(BytesIO(conf.encode()), as_attachment=True, download_name=f"{peer['name']}.conf", mimetype="text/plain")


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
    conf = client_conf_text(peer["name"], peer["private_key"], peer["vpn_ip"])
    img = qrcode.make(conf)
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


def share_public_url(token: str) -> str:
    return f"{PUBLIC_BASE}/s/{token}/page"


@app.route("/peers/<int:peer_id>/toggle", methods=["POST"])
@login_required
def peer_toggle(peer_id: int):
    con = db()
    peer = con.execute("SELECT enabled FROM peers WHERE id=?", (peer_id,)).fetchone()
    if not peer:
        con.close()
        abort(404)
    con.execute("UPDATE peers SET enabled=? WHERE id=?", (0 if peer["enabled"] else 1, peer_id))
    con.commit()
    con.close()
    try:
        persist_wg_conf()
        flash("Статус обновлён.", "ok")
    except Exception as e:
        flash(f"Ошибка sync: {e}", "error")
    return redirect(url_for("dashboard"))


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


@app.route("/instructions")
@login_required
def instructions():
    return render_template("instructions.html", endpoint=SERVER_ENDPOINT)


@app.route("/s/<token>/page")
def share_page(token: str):
    con = db()
    row = con.execute("SELECT * FROM share_tokens WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < int(time.time()) or row["uses"] >= row["max_uses"]:
        con.close()
        abort(410)
    peer = con.execute("SELECT name, vpn_ip FROM peers WHERE id=?", (row["peer_id"],)).fetchone()
    left = row["max_uses"] - row["uses"]
    con.close()
    return render_template("share.html", token=token, peer=peer, left=left, expires_at=row["expires_at"], now=int(time.time()))


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
    conf = client_conf_text(peer["name"], peer["private_key"], peer["vpn_ip"])
    return send_file(BytesIO(conf.encode()), as_attachment=True, download_name=f"{peer['name']}.conf", mimetype="text/plain")


@app.route("/s/<token>/qr.png")
def share_qr(token: str):
    con = db()
    row = con.execute("SELECT * FROM share_tokens WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < int(time.time()) or row["uses"] >= row["max_uses"]:
        con.close()
        abort(410)
    peer = con.execute("SELECT * FROM peers WHERE id=?", (row["peer_id"],)).fetchone()
    con.close()
    if not peer or qrcode is None:
        abort(404 if not peer else 500)
    conf = client_conf_text(peer["name"], peer["private_key"], peer["vpn_ip"])
    img = qrcode.make(conf)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


def create_app() -> Flask:
    init_db()
    ensure_admin()
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
