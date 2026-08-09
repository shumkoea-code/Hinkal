import { rejectIfModuleDisabled } from '@/lib/require-module';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { registerRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { profanityResponse } from '@/lib/censor';
import { isRussianEmail, RU_EMAIL_HINT } from '@/lib/ru-email';
import { normalizePhone } from '@/lib/phone';
import { sendEmail } from '@/lib/email';
import { originFromEnv } from '@/lib/site-identity-shared';
import { getAccessSettings } from '@/lib/access-settings';
import { consumeCaptchaToken } from '@/lib/captcha';

const registerSchema = z.object({
  name: z.string().min(2, 'Имя слишком короткое').max(100),
  email: z.string().email('Некорректный email'),
  phone: z.string().min(10, 'Некорректный телефон').max(30),
  password: z.string().min(6, 'Пароль должен быть минимум 6 символов').max(100),
  birthDate: z.string().min(8, 'Укажите дату рождения'),
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: 'Нужно принять политику, правила и cookie',
  }),
  personalDataConsent: z.boolean().refine((v) => v === true, {
    message: 'Нужно согласие на обработку персональных данных',
  }),
  captchaToken: z.string().min(10, 'Пройдите проверку'),
  website: z.string().optional(),
  ref: z.string().max(24).optional(),
  fingerprint: z.string().max(128).optional(),
});

function ageFromBirthDate(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export async function POST(req: Request) {
  {
    const blocked = await rejectIfModuleDisabled('registration');
    if (blocked) return blocked;
  }
  try {
    const access = await getAccessSettings();
    if (!access.registrationEnabled) {
      return NextResponse.json(
        { message: 'Регистрация временно закрыта администрацией портала.' },
        { status: 403 }
      );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    if (!(await registerRateLimiter.checkAsync(ip))) {
      return NextResponse.json(
        rateLimitJson('Слишком много запросов. Попробуйте позже.'),
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Некорректные данные';
      return NextResponse.json({ message: errorMsg }, { status: 400 });
    }

    const cap = await consumeCaptchaToken(parseResult.data.captchaToken, parseResult.data.website);
    if (!cap.ok) {
      return NextResponse.json({ message: cap.message }, { status: 400 });
    }

    const name = parseResult.data.name.trim();
    const email = parseResult.data.email.trim().toLowerCase();
    const password = parseResult.data.password;
    const birthDateRaw = parseResult.data.birthDate.trim().slice(0, 10);
    const phoneDigits = normalizePhone(parseResult.data.phone);
    const phone = phoneDigits ? `+${phoneDigits}` : '';

    if (!isRussianEmail(email)) {
      return NextResponse.json({ message: RU_EMAIL_HINT }, { status: 400 });
    }
    if (phoneDigits.length < 11) {
      return NextResponse.json({ message: 'Укажите корректный российский телефон' }, { status: 400 });
    }

    const age = ageFromBirthDate(birthDateRaw);
    if (age === null) {
      return NextResponse.json({ message: 'Некорректная дата рождения' }, { status: 400 });
    }
    if (age < 14) {
      return NextResponse.json(
        { message: 'Регистрация доступна с 14 лет (152-ФЗ)' },
        { status: 400 }
      );
    }

    const dirty = profanityResponse(name);
    if (dirty) return dirty;

    const existingByEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existingByEmail) {
      return NextResponse.json(
        { message: 'Пользователь с таким email уже существует' },
        { status: 400 }
      );
    }

    const national = phoneDigits.slice(-10);
    const phoneConflict = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User"
      WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
      LIMIT 1
    `;
    if (phoneConflict[0]) {
      return NextResponse.json(
        { message: 'Пользователь с таким телефоном уже существует' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // 6-digit OTP (~1e6 space); rate-limited per IP on /api/verify
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const meta = JSON.stringify({
      privacyAccepted: true,
      personalDataConsent: true,
      birthDate: birthDateRaw,
      referralCode: (parseResult.data.ref || '').trim().slice(0, 24) || null,
      fingerprint: (parseResult.data.fingerprint || '').trim().slice(0, 128) || null,
      signupIp: ip,
    });

    await prisma.pendingUser.deleteMany({
      where: { OR: [{ email }, { phone }] },
    });

    await prisma.pendingUser.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        token: code,
        expires,
        meta,
      },
    });

    const origin = originFromEnv({ allowLocal: process.env.NODE_ENV !== 'production' });
    const verifyUrl = `${origin}/verify?email=${encodeURIComponent(email)}`;
    const mailed = await sendEmail(
      email,
      'Код подтверждения — Young Portal',
      `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a5f;margin:0 0 12px">Подтверждение регистрации</h2>
          <p style="color:#475569;line-height:1.5">Здравствуйте, ${name}!</p>
          <p style="color:#475569;line-height:1.5">Ваш код подтверждения:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a5f;margin:16px 0">${code}</p>
          <p style="color:#64748b;font-size:14px">Код действителен 24 часа.</p>
          <p style="margin-top:20px"><a href="${verifyUrl}" style="color:#2563eb">Открыть страницу подтверждения</a></p>
        </div>
      `
    );

    if (!mailed.success) {
      // Keep PendingUser so admins can activate or resend when mail provider is down.
      console.error('[register] email send failed', mailed.error, mailed.provider);
      return NextResponse.json(
        {
          message:
            'Заявка создана, но письмо с кодом не удалось отправить. Попробуйте позже или обратитесь к администратору портала — заявку можно подтвердить вручную.',
          requiresVerification: true,
          email,
          emailDeliveryFailed: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        message: 'Код подтверждения отправлен на email',
        requiresVerification: true,
        email,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
