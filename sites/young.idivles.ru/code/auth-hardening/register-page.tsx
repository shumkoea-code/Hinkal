'use client';

import CaptchaField from '@/components/CaptchaField';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { RU_EMAIL_HINT, isRussianEmail } from '@/lib/ru-email';
import { safeCallbackUrl } from '@/lib/safe-callback-url';

function RegisterForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [pdConsentAccepted, setPdConsentAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const refFromUrl = (searchParams.get('ref') || '').trim();
  function readRefCookie() {
    try {
      const m = document.cookie.match(/(?:^|; )yp_ref=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'), '');
  // empty fallback: register may omit redirect

  useEffect(() => {
    fetch('/api/public/status')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.registrationEnabled === false) setRegistrationEnabled(false);
      })
      .catch(() => undefined);
  }, []);

  const withCallback = (path: string) => {
    const safe = safeCallbackUrl(callbackUrl, '');
    if (!safe) return path;
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}callbackUrl=${encodeURIComponent(safe)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Имя и фамилия обязательны для заполнения');
      return;
    }
    if (!isRussianEmail(email)) {
      setError(RU_EMAIL_HINT);
      return;
    }
    if (!privacyAccepted) {
      setError('Примите политику конфиденциальности и правила сайта');
      return;
    }
    if (!pdConsentAccepted) {
      setError('Нужно отдельное согласие на обработку персональных данных');
      return;
    }
    if (!birthDate) {
      setError('Укажите дату рождения');
      return;
    }

    if (!captchaToken) {
      setError('Пройдите проверку «я не робот»');
      return;
    }

    setLoading(true);

    try {
      const name = `${firstName.trim()} ${lastName.trim()}`;
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          birthDate,
          privacyAccepted: true,
          personalDataConsent: true,
          captchaToken,
          website: '',
        ref: refFromUrl || readRefCookie() || undefined,
      }),
      });

      if (res.ok) {
        const data = await res.json();
        const { reachGoal } = await import('@/components/YandexMetrika');
        reachGoal('register');
        try {
          const { writeCookieConsent } = await import('@/lib/cookie-consent');
          const { COOKIES_POLICY_VERSION } = await import('@/lib/consent-versions');
          // Necessary cookies only at signup; analytics — via ConsentBanner («Принять все»)
          writeCookieConsent({ analytics: false, preferences: false }, COOKIES_POLICY_VERSION);
        } catch {
          /* ignore */
        }
        if (data.requiresVerification) {
          router.push(withCallback('/verify?email=' + encodeURIComponent(data.email)));
        } else {
          const { signIn } = await import('next-auth/react');
          const loginRes = await signIn('credentials', {
            redirect: false,
            email: email.trim().toLowerCase(),
            password,
          });
          if (loginRes?.ok) {
            window.location.assign(safeCallbackUrl(callbackUrl, '/dashboard'));
            return;
          }
          router.push(withCallback('/login?registered=1'));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Ошибка при регистрации');
      }
    } catch {
      setError('Произошла ошибка при отправке данных');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem - 100px)', padding: '1rem' }}>
      <motion.div
        className="glass"
        style={{ width: '100%', maxWidth: '450px', padding: '1.25rem' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-gradient auth-form-title" style={{ marginBottom: '2rem' }}>
          Регистрация
        </h1>

        {!registrationEnabled ? (
          <div
            style={{
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              padding: '1rem',
              borderRadius: 12,
              marginBottom: '1rem',
              fontSize: '0.92rem',
              lineHeight: 1.5,
            }}
          >
            Регистрация временно закрыта администрацией. Если у вас уже есть аккаунт —{' '}
            <Link href={withCallback('/login')} style={{ fontWeight: 700, color: '#c2410c' }}>
              войдите
            </Link>
            . Вопросы — через{' '}
            <Link href="/contacts" style={{ fontWeight: 700, color: '#c2410c' }}>
              контакты
            </Link>
            .
          </div>
        ) : null}

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

        <form
          onSubmit={handleSubmit}
          style={{
            display: registrationEnabled ? 'flex' : 'none',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Имя *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                placeholder="Иван"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Фамилия *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                placeholder="Иванов"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Email (РФ)</label>
            <input
              type="email"
              autoComplete="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              placeholder="vash@mail.ru"
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              {RU_EMAIL_HINT}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Телефон</label>
            <input
              type="tel"
              autoComplete="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              placeholder="+7 (999) 000-00-00"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Пароль</label>
            <input
              type="password"
              autoComplete="new-password"
              name="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              placeholder="••••••••"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Дата рождения *</label>
            <input
              type="date"
              name="birthDate"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              max={new Date().toISOString().slice(0, 10)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              Регистрация доступна с 14 лет.
            </p>
          </div>

          <label
            style={{
              display: 'flex',
              gap: '0.65rem',
              alignItems: 'flex-start',
              fontSize: '0.88rem',
              lineHeight: 1.45,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              required
              style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
            />
            <span>
              Я принимаю{' '}
              <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                политику конфиденциальности
              </Link>
              {', '}
              <Link href="/rules" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                правила сайта
              </Link>
              {', '}
              <Link href="/terms" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                пользовательское соглашение
              </Link>
              {' и '}
              <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                условия cookie
              </Link>
              .
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              gap: '0.65rem',
              alignItems: 'flex-start',
              fontSize: '0.88rem',
              lineHeight: 1.45,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={pdConsentAccepted}
              onChange={(e) => setPdConsentAccepted(e.target.checked)}
              required
              style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
            />
            <span>
              Отдельно даю согласие на обработку персональных данных в целях работы портала (регистрация,
              заявки, мероприятия, уведомления) согласно{' '}
              <Link href="/privacy" target="_blank" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                политике конфиденциальности
              </Link>
              . Цифровая подпись сохранится в профиле.
            </span>
          </label>

                    <CaptchaField onToken={setCaptchaToken} />
<button
            type="submit"
            disabled={loading || !privacyAccepted || !pdConsentAccepted}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.25rem' }}
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Уже есть аккаунт?{' '}
          <Link
            href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'}
            style={{ color: 'var(--primary)', fontWeight: 500 }}
          >
            Войти
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function Register() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>Загрузка...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
