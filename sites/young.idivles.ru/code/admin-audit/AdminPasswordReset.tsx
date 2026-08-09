'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check } from 'lucide-react';

type Props = {
  userId: string;
  email?: string | null;
};

export default function AdminPasswordReset({ userId, email }: Props) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [temp, setTemp] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function resetPassword(useCustom: boolean) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    setTemp(null);
    setCopied(false);
    try {
      const body: Record<string, unknown> = { mustChangePassword: true };
      if (useCustom) {
        const p = custom.trim();
        if (p.length < 8) {
          setErr('Пароль не короче 8 символов');
          setBusy(false);
          return;
        }
        body.password = p;
      }
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || 'Не удалось сбросить пароль');
        return;
      }
      setTemp(data.temporaryPassword || null);
      setMsg(data.message || 'Пароль сброшен');
      setCustom('');
    } catch {
      setErr('Сеть / сервер недоступны');
    } finally {
      setBusy(false);
    }
  }

  async function copyTemp() {
    if (!temp) return;
    try {
      await navigator.clipboard.writeText(temp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '1rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
        <KeyRound size={18} style={{ color: 'var(--primary)' }} />
        <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>Сброс пароля</h2>
      </div>
      <p style={{ margin: '0 0 0.75rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.4 }}>
        Сбрасывает пароль{email ? ` для ${email}` : ''}, инвалидирует сессии и требует смену пароля при
        следующем входе. Действие пишется в журнал аудита.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Свой пароль (необязательно, мин. 8)"
          autoComplete="new-password"
          style={{
            width: '100%',
            padding: '0.55rem 0.7rem',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            font: 'inherit',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void resetPassword(false)}
          >
            Сгенерировать временный
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || custom.trim().length < 8}
            onClick={() => void resetPassword(true)}
          >
            Установить свой
          </button>
        </div>
      </div>
      {err ? (
        <p style={{ color: '#b91c1c', margin: '0.75rem 0 0', fontSize: '0.88rem' }}>{err}</p>
      ) : null}
      {msg ? (
        <p style={{ color: '#047857', margin: '0.75rem 0 0', fontSize: '0.88rem' }}>{msg}</p>
      ) : null}
      {temp ? (
        <div
          style={{
            marginTop: 10,
            padding: '0.65rem 0.75rem',
            borderRadius: 10,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <code style={{ fontSize: '0.95rem', fontWeight: 700, wordBreak: 'break-all' }}>{temp}</code>
          <button type="button" className="btn btn-secondary" onClick={() => void copyTemp()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span style={{ marginLeft: 6 }}>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
          <p style={{ width: '100%', margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
            Покажите пароль пользователю один раз. В журнал аудита сам пароль не пишется.
          </p>
        </div>
      ) : null}
    </div>
  );
}
