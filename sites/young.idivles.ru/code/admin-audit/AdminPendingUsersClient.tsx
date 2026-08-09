'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, UserCheck, Mail } from 'lucide-react';

type Item = {
  id: string;
  name: string;
  email: string;
  phone: string;
  expires: string;
  createdAt: string;
  expired: boolean;
};

export default function AdminPendingUsersClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/pending-users', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || 'Не удалось загрузить заявки');
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      setErr('Сеть / сервер недоступны');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate(id: string) {
    setBusyId(id);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/admin/pending-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || 'Не удалось активировать');
        return;
      }
      setMsg(data.message || 'Активировано');
      await load();
    } catch {
      setErr('Сеть / сервер недоступны');
    } finally {
      setBusyId(null);
    }
  }

  async function resend(id: string) {
    setBusyId(id);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/admin/pending-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || data.emailError || 'Письмо не отправлено');
        return;
      }
      setMsg(data.message || 'Код отправлен');
    } catch {
      setErr('Сеть / сервер недоступны');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} />
          <span style={{ marginLeft: 6 }}>Обновить</span>
        </button>
        <Link href="/admin/audit-log" className="btn btn-secondary">
          Журнал аудита
        </Link>
      </div>
      {msg ? <p style={{ color: '#047857', fontSize: '0.9rem' }}>{msg}</p> : null}
      {err ? <p style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{err}</p> : null}
      {loading ? <p style={{ color: 'var(--muted)' }}>Загрузка…</p> : null}
      {!loading && items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Нет незавершённых регистраций</p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              background: 'white',
              borderRadius: 12,
              padding: '0.85rem 1rem',
              boxShadow: 'var(--shadow-sm)',
              border: it.expired ? '1px solid #fecaca' : '1px solid transparent',
            }}
          >
            <div style={{ fontWeight: 750 }}>{it.name}</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
              {it.email} · {it.phone}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Создано: {new Date(it.createdAt).toLocaleString('ru-RU')} · код до{' '}
              {new Date(it.expires).toLocaleString('ru-RU')}
              {it.expired ? ' · истёк' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyId === it.id}
                onClick={() => void activate(it.id)}
              >
                <UserCheck size={16} />
                <span style={{ marginLeft: 6 }}>Активировать</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busyId === it.id}
                onClick={() => void resend(it.id)}
              >
                <Mail size={16} />
                <span style={{ marginLeft: 6 }}>Повторить письмо</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
