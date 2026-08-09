'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!token) {
    return <div style={{ textAlign: 'center', padding: '5rem' }}>Неверная ссылка для восстановления.</div>;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password');
    const confirm = formData.get('confirm');

    if (password !== confirm) {
      setStatus('error');
      setMessage('Пароли не совпадают');
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus('success');
        setMessage('Пароль успешно изменен!');
      } else {
        setStatus('error');
        setMessage(data.message || 'Произошла ошибка');
      }
    } catch (e) {
      setStatus('error');
      setMessage('Ошибка соединения сервера');
    }
  };

  return (
    <div className="glass" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: 'var(--radius-xl)' }}>
      <h1 className="auth-form-title" style={{ marginBottom: '1.5rem' }}>Новый пароль</h1>
      
      {status === 'success' ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--success)', marginBottom: '1.5rem', fontWeight: 500 }}>{message}</p>
          <Link href="/login" className="btn btn-primary" style={{ display: 'inline-block', width: '100%', textDecoration: 'none' }}>Войти с новым паролем</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {status === 'error' && <p style={{ color: 'var(--destructive)', fontSize: '0.9rem', margin: 0 }}>{message}</p>}
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>Новый пароль</label>
            <input name="password" type="password" required minLength={8} className="modern-input" placeholder="••••••••" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>Повторите пароль</label>
            <input name="confirm" type="password" required minLength={8} className="modern-input" placeholder="••••••••" />
          </div>
          
          <button type="submit" disabled={status === 'loading'} className="btn btn-primary" style={{ marginTop: '1rem', padding: '0.8rem' }}>
            {status === 'loading' ? 'Сохранение...' : 'Сохранить пароль'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPassword() {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <Suspense fallback={<div style={{ textAlign: 'center', padding: '5rem' }}>Загрузка...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}