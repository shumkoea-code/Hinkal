'use client';

import { FormEvent, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function ChangePasswordPage() {
  const { data: session, update, status } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const forced = Boolean((session?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Новый пароль — минимум 8 символов');
      return;
    }
    if (newPassword !== confirm) {
      toast.error('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success(data.message || 'Пароль обновлён');
      if (typeof data.keepAlive === 'string' && data.keepAlive) {
        await update({ keepAlive: data.keepAlive });
      } else {
        await update();
      }
      const role = session?.user?.role;
      router.replace(role === 'TECH' ? '/ops' : role === 'ADMIN' || role === 'MODERATOR' ? '/admin' : '/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>Загрузка…</div>;
  }
  if (status === 'unauthenticated') {
    router.replace('/login?callbackUrl=/change-password');
    return null;
  }

  return (
    <div className="container" style={{ maxWidth: 480, padding: '2.5rem 1rem 4rem' }}>
      <h1 style={{ fontWeight: 800, fontSize: '1.45rem', margin: '0 0 0.5rem' }}>
        {forced ? 'Смените пароль' : 'Смена пароля'}
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 1.25rem', fontSize: '0.92rem' }}>
        {forced
          ? 'Нужно задать новый пароль (временный или выданный администратором больше не действует для входа в обычном режиме).'
          : 'Задайте новый пароль для вашей учётной записи.'}
      </p>
      <form onSubmit={onSubmit} className="card-surface" style={{ padding: '1.25rem', display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem', fontWeight: 600 }}>
          Текущий пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem', fontWeight: 600 }}>
          Новый пароль
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem', fontWeight: 600 }}>
          Повтор нового пароля
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4 }}>
          {busy ? 'Сохранение…' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  );
}
