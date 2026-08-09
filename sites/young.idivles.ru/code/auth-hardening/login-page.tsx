'use client';

import CaptchaField from '@/components/CaptchaField';

import { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { isPhoneLikeLogin, normalizePhone } from '@/lib/phone';
import { safeCallbackUrl } from '@/lib/safe-callback-url';

async function offerSavePassword(login: string, password: string, form?: HTMLFormElement | null) {
  try {
    const PasswordCredentialCtor = (window as any).PasswordCredential;
    if (typeof PasswordCredentialCtor === 'function') {
      const cred = form
        ? new PasswordCredentialCtor(form)
        : new PasswordCredentialCtor({ id: login, name: login, password });
      await navigator.credentials.store(cred);
    }
  } catch {
    /* ignore */
  }
}

function LoginForm() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [captchaToken, setCaptchaToken] = useState('');
  const [oauth, setOauth] = useState<{ yandex?: boolean; vk?: boolean }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'), '/dashboard');
  const staffMode = searchParams.get('staff') === '1' || callbackUrl.startsWith('/admin') || callbackUrl.startsWith('/scanner');

  const phoneMode = useMemo(() => isPhoneLikeLogin(login), [login]);
  const role = session?.user?.role;
  const isStaffSession = role === 'ADMIN' || role === 'MODERATOR' || role === 'SCANNER';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/status')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMaintenanceOn(Boolean(d?.maintenanceMode));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmed = login.trim();
    const loginValue = isPhoneLikeLogin(trimmed) ? normalizePhone(trimmed) : trimmed;

    if (failCount >= 2 && !captchaToken) {
      setLoading(false);
      setError('Пройдите проверку после нескольких неудачных попыток');
      return;
    }

    const result = await signIn('credentials', {
      redirect: false,
      email: loginValue,
      password,
      requireCaptcha: failCount >= 2 ? '1' : '0',
      captchaToken,
      website: '',
    });

    if (result?.error) {
      setLoading(false);
      setFailCount((n) => n + 1);
      setCaptchaToken('');
      const raw = String(result.error);
      setError(
        !raw || raw === 'CredentialsSignin'
          ? 'Неверный email/телефон или пароль'
          : raw
      );
      return;
    }

    await offerSavePassword(loginValue, password, formRef.current);

    try {
      const { pingSecurity } = await import('@/lib/device-fingerprint');
      await pingSecurity('LOGIN');
    } catch {
      /* ignore */
    }

    let dest = callbackUrl;
    let nextRole: string | undefined;
    try {
      const sessionRes = await fetch('/api/auth/session');
      const nextSession = await sessionRes.json();
      nextRole = nextSession?.user?.role;
      const mustChange = Boolean(nextSession?.user?.mustChangePassword);
      if (mustChange) {
        dest = '/change-password';
      } else if (nextRole === 'SCANNER') dest = '/scanner';
      else if (
        (nextRole === 'ADMIN' || nextRole === 'MODERATOR') &&
        (callbackUrl === '/dashboard' || !callbackUrl || staffMode)
      ) {
        dest = '/admin';
      }
    } catch {
      /* keep */
    }

    const staffOk = nextRole === 'ADMIN' || nextRole === 'MODERATOR' || nextRole === 'SCANNER';
    if (maintenanceOn && !staffOk) {
      setLoading(false);
      setError(
        staffMode
          ? 'Сейчас доступ только для сотрудников (админ / модератор / сканер).'
          : 'Портал на обслуживании. Обычные аккаунты временно недоступны.'
      );
      window.location.assign('/maintenance');
      return;
    }

    window.location.assign(dest);
  };

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((p) => setOauth({ yandex: Boolean(p?.yandex), vk: Boolean(p?.vk) }))
      .catch(() => setOauth({}));
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: maintenanceOn ? '100svh' : 'calc(100vh - 4rem - 100px)',
        padding: '1rem',
      }}
    >
      <motion.div
        className="glass"
        style={{ width: '100%', maxWidth: '400px', padding: '1.25rem' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-gradient auth-form-title">
          {staffMode || maintenanceOn ? 'Вход для сотрудников' : 'Вход'}
        </h1>
        {(staffMode || maintenanceOn) && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem', margin: '0 0 1.25rem', lineHeight: 1.45 }}>
            {maintenanceOn
              ? 'Сайт на обслуживании. Войти могут администраторы, модераторы и сканеры.'
              : 'Служебный вход в панель управления.'}
          </p>
        )}

        {sessionStatus === 'authenticated' && maintenanceOn && !isStaffSession && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 12,
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.88rem',
              lineHeight: 1.45,
            }}
          >
            Сейчас вы вошли как обычный пользователь. Чтобы открыть панель, выйдите и войдите учётной записью
            сотрудника.
            <button
              type="button"
              className="btn btn-secondary"
              disabled={signingOut}
              style={{ width: '100%', marginTop: '0.75rem' }}
              onClick={async () => {
                setSigningOut(true);
                await signOut({ redirect: false });
                window.location.assign('/login?callbackUrl=%2Fadmin&staff=1');
              }}
            >
              {signingOut ? 'Выход…' : 'Выйти и войти как сотрудник'}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              color: 'var(--accent)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              {phoneMode ? 'Телефон' : 'Email или телефон'}
            </label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.8)',
                outline: 'none',
              }}
              placeholder="email@example.com или +7…"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Пароль</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.8)',
                outline: 'none',
              }}
              placeholder="••••••••"
            />
          </div>

          <div style={{ textAlign: 'right', marginTop: '-0.5rem' }}>
            <Link href="/forgot-password" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
              Забыли пароль?
            </Link>
          </div>

                  {failCount >= 2 && (
          <CaptchaField onToken={setCaptchaToken} />
        )}
<button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        {(oauth.yandex || oauth.vk) && (
          <div style={{ marginTop: '1rem', display: 'grid', gap: 8 }}>
            <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>или</div>
            {oauth.yandex ? (
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => void signIn('yandex', { callbackUrl })}>
                Войти через Яндекс
              </button>
            ) : null}
            {oauth.vk ? (
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => void signIn('vk', { callbackUrl })}>
                Войти через VK
              </button>
            ) : null}
          </div>
        )}


        {!maintenanceOn && !staffMode && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
            Нет аккаунта?{' '}
            <Link
              href={
                callbackUrl && callbackUrl !== '/dashboard'
                  ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
                  : '/register'
              }
              style={{ color: 'var(--primary)', fontWeight: 500 }}
            >
              Зарегистрироваться
            </Link>
          </p>
        )}

        {maintenanceOn && (
          <p style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <Link href="/maintenance" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              ← К заглушке
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}
