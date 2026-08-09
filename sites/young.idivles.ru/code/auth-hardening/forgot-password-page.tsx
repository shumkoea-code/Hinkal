'use client';
import { useState } from 'react';
import Link from 'next/link';

type Mode = 'email' | 'phrase';

export default function ForgotPassword() {
  const [mode, setMode] = useState<Mode>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage('Ссылка для восстановления отправлена на ваш email.');
      } else {
        setStatus('error');
        setMessage(data.message || 'Произошла ошибка');
      }
    } catch {
      setStatus('error');
      setMessage('Ошибка соединения сервера');
    }
  };

  const handlePhraseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') || '');
    const phrase = String(formData.get('phrase') || '');
    const password = String(formData.get('password') || '');
    const confirm = String(formData.get('confirm') || '');

    if (password !== confirm) {
      setStatus('error');
      setMessage('Пароли не совпадают');
      return;
    }

    try {
      const res = await fetch('/api/auth/recovery-phrase/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phrase, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Пароль изменён.');
      } else {
        setStatus('error');
        setMessage(data.message || 'Произошла ошибка');
      }
    } catch {
      setStatus('error');
      setMessage('Ошибка соединения сервера');
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus('idle');
    setMessage('');
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="glass" style={{ width: '100%', maxWidth: '440px', padding: '2rem', borderRadius: 'var(--radius-xl)' }}>
        <h1 className="auth-form-title">
          Восстановление пароля
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginBottom: '1.25rem',
            padding: 4,
            borderRadius: 12,
            background: 'rgba(15,23,42,0.05)',
          }}
        >
          <button
            type="button"
            onClick={() => switchMode('email')}
            className="btn"
            style={{
              padding: '0.55rem',
              fontWeight: 700,
              fontSize: '0.82rem',
              background: mode === 'email' ? 'var(--primary)' : 'transparent',
              color: mode === 'email' ? '#fff' : 'var(--muted)',
              border: 'none',
            }}
          >
            По email
          </button>
          <button
            type="button"
            onClick={() => switchMode('phrase')}
            className="btn"
            style={{
              padding: '0.55rem',
              fontWeight: 700,
              fontSize: '0.82rem',
              background: mode === 'phrase' ? 'var(--primary)' : 'transparent',
              color: mode === 'phrase' ? '#fff' : 'var(--muted)',
              border: 'none',
            }}
          >
            24 слова
          </button>
        </div>

        {status === 'success' ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--success)', marginBottom: '1.5rem', fontWeight: 500 }}>{message}</p>
            <Link
              href="/login"
              className="btn btn-primary"
              style={{ display: 'inline-block', width: '100%', textDecoration: 'none' }}
            >
              Вернуться ко входу
            </Link>
          </div>
        ) : mode === 'email' ? (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {status === 'error' && (
              <p style={{ color: 'var(--destructive)', fontSize: '0.9rem', margin: 0 }}>{message}</p>
            )}

            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              Пришлём ссылку на сброс пароля, если аккаунт с таким email есть в системе.
            </p>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--muted)',
                }}
              >
                Ваш Email
              </label>
              <input name="email" type="email" required className="modern-input" placeholder="mail@example.com" />
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', padding: '0.8rem' }}
            >
              {status === 'loading' ? 'Отправка...' : 'Восстановить пароль'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <Link href="/login" style={{ color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none' }}>
                Я вспомнил пароль
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePhraseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {status === 'error' && (
              <p style={{ color: 'var(--destructive)', fontSize: '0.9rem', margin: 0 }}>{message}</p>
            )}

            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              Введите email и фразу из 24 русских слов (создаётся в личном кабинете → Безопасность).
              Порядок слов важен.
            </p>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--muted)',
                }}
              >
                Email
              </label>
              <input name="email" type="email" required className="modern-input" placeholder="mail@example.com" />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--muted)',
                }}
              >
                Фраза из 24 слов
              </label>
              <textarea
                name="phrase"
                required
                rows={5}
                className="modern-input"
                placeholder="слово1 слово2 … слово24"
                style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.88rem' }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--muted)',
                }}
              >
                Новый пароль
              </label>
              <input name="password" type="password" required minLength={8} className="modern-input" placeholder="••••••••" />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--muted)',
                }}
              >
                Повторите пароль
              </label>
              <input name="confirm" type="password" required minLength={8} className="modern-input" placeholder="••••••••" />
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', padding: '0.8rem' }}
            >
              {status === 'loading' ? 'Проверяем…' : 'Сбросить пароль по фразе'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <Link href="/login" style={{ color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none' }}>
                Я вспомнил пароль
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
