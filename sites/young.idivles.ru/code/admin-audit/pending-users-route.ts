import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAdminAction } from '@/lib/admin-audit';
import { generatePublicCode } from '@/lib/public-id';
import {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
  buildConsentSignature,
} from '@/lib/consent';
import { unlockAchievement } from '@/lib/award-achievements';
import { attributeReferralOnSignup, ensureReferralCode } from '@/lib/referrals';
import { sendEmail } from '@/lib/email';
import { originFromEnv } from '@/lib/site-identity-shared';

type PendingMeta = {
  privacyAccepted?: boolean;
  personalDataConsent?: boolean;
  birthDate?: string;
  referralCode?: string | null;
  fingerprint?: string | null;
  signupIp?: string | null;
};

async function requireStaff() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'ADMIN' && role !== 'TECH')) return null;
  return session;
}

/** List pending registrations */
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });

  const rows = await prisma.pendingUser.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      expires: true,
      createdAt: true,
      meta: true,
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      expired: r.expires.getTime() < Date.now(),
    })),
  });
}

/** Activate pending user (email delivery broken / manual confirm) */
export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!id && !email) {
    return NextResponse.json({ message: 'Укажите id или email заявки' }, { status: 400 });
  }

  const pending = await prisma.pendingUser.findFirst({
    where: id ? { id } : { email },
  });
  if (!pending) {
    return NextResponse.json({ message: 'Заявка не найдена' }, { status: 404 });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: pending.email }, { phone: pending.phone }],
    },
  });
  if (existing) {
    await prisma.pendingUser.delete({ where: { id: pending.id } }).catch(() => null);
    return NextResponse.json(
      { message: 'Пользователь уже существует', userId: existing.id },
      { status: 409 }
    );
  }

  let meta: PendingMeta = {};
  try {
    meta = pending.meta ? (JSON.parse(pending.meta) as PendingMeta) : {};
  } catch {
    meta = {};
  }

  const now = new Date();
  let birthDate: Date | null = null;
  if (meta.birthDate) {
    const d = new Date(meta.birthDate);
    if (!Number.isNaN(d.getTime())) birthDate = d;
  }

  let user;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      user = await prisma.user.create({
        data: {
          name: pending.name,
          email: pending.email,
          phone: pending.phone,
          password: pending.password,
          publicCode: generatePublicCode(),
          emailVerified: now,
          phoneVerified: now,
          birthDate,
          privacyAcceptedAt: now,
          privacyFirstAcceptedAt: now,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          cookiesAcceptedAt: now,
          cookiesPolicyVersion: COOKIES_POLICY_VERSION,
          rulesAcceptedAt: now,
          rulesPolicyVersion: RULES_POLICY_VERSION,
          privacySignature: buildConsentSignature({
            email: pending.email,
            kind: 'privacy',
            version: PRIVACY_POLICY_VERSION,
            at: now,
          }),
          cookiesSignature: buildConsentSignature({
            email: pending.email,
            kind: 'cookies',
            version: COOKIES_POLICY_VERSION,
            at: now,
          }),
          rulesSignature: buildConsentSignature({
            email: pending.email,
            kind: 'rules',
            version: RULES_POLICY_VERSION,
            at: now,
          }),
        },
      });
      break;
    } catch (e: any) {
      if (e?.code === 'P2002' && attempt < 7) continue;
      throw e;
    }
  }
  if (!user) {
    return NextResponse.json({ message: 'Не удалось создать пользователя' }, { status: 500 });
  }

  await prisma.pendingUser.delete({ where: { id: pending.id } }).catch(() => null);
  await unlockAchievement(user.id, 'FIRST_STEPS').catch(() => null);
  await unlockAchievement(user.id, 'PRIVACY_OK').catch(() => null);
  await unlockAchievement(user.id, 'RULES_OK').catch(() => null);
  void ensureReferralCode(user.id).catch(() => null);
  void attributeReferralOnSignup({
    refereeId: user.id,
    code: meta.referralCode,
    ip: meta.signupIp || null,
    fingerprint: meta.fingerprint,
  }).catch(() => null);

  await logAdminAction({
    actorId: session.user!.id!,
    actorEmail: session.user!.email,
    actorRole: session.user!.role,
    action: 'PENDING_USER_ACTIVATE',
    targetType: 'PendingUser',
    targetId: pending.id,
    targetEmail: pending.email,
    detail: { userId: user.id, name: pending.name },
  });

  return NextResponse.json({
    message: 'Пользователь активирован. Может войти с паролем, указанным при регистрации.',
    userId: user.id,
    email: user.email,
  });
}

/** Resend verification code email for a pending registration */
export async function PUT(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const pending = await prisma.pendingUser.findFirst({
    where: id ? { id } : { email },
  });
  if (!pending) {
    return NextResponse.json({ message: 'Заявка не найдена' }, { status: 404 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.pendingUser.update({
    where: { id: pending.id },
    data: { token: code, expires },
  });

  const origin = originFromEnv({ allowLocal: process.env.NODE_ENV !== 'production' });
  const verifyUrl = `${origin}/verify?email=${encodeURIComponent(pending.email)}`;
  const mailed = await sendEmail(
    pending.email,
    'Код подтверждения — Центр развития молодежи Сочи',
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f;margin:0 0 12px">Подтверждение регистрации</h2>
        <p style="color:#475569;line-height:1.5">Здравствуйте, ${pending.name}!</p>
        <p style="color:#475569;line-height:1.5">Ваш код подтверждения (повторная отправка админом):</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a5f;margin:16px 0">${code}</p>
        <p style="color:#64748b;font-size:14px">Код действителен 24 часа.</p>
        <p style="margin-top:20px"><a href="${verifyUrl}" style="color:#2563eb">Открыть страницу подтверждения</a></p>
      </div>
    `
  );

  await logAdminAction({
    actorId: session.user!.id!,
    actorEmail: session.user!.email,
    actorRole: session.user!.role,
    action: 'PENDING_USER_RESEND_CODE',
    targetType: 'PendingUser',
    targetId: pending.id,
    targetEmail: pending.email,
    detail: { mailed: mailed.success, error: mailed.error || null, provider: mailed.provider || null },
  });

  if (!mailed.success) {
    return NextResponse.json(
      {
        message:
          'Код обновлён в заявке, но письмо не отправлено. Проверьте Resend API-ключ в настройках почты или активируйте заявку вручную.',
        emailError: mailed.error,
        pendingId: pending.id,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ message: 'Код отправлен на email', email: pending.email });
}
