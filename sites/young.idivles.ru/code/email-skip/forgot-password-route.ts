import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, isOutboundEmailReady } from '@/lib/email';
import crypto from 'crypto';
import { resetPasswordRateLimiter } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!await resetPasswordRateLimiter.checkAsync(ip)) {
      return NextResponse.json({ message: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 });
    }

    const email = String((await req.json()).email || '').trim().toLowerCase();
    if (!email) return NextResponse.json({ message: 'Email обязателен' }, { status: 400 });

    const started = Date.now();
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null, blockedAt: null },
      select: { id: true, email: true },
    });
    if (!user?.email) {
      // Constant-ish delay to reduce account enumeration via timing
      const wait = 400 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      return NextResponse.json({ message: 'Ок' }, { status: 200 });
    }

    // No mail provider — skip email recovery (phrase / admin reset instead)
    if (!(await isOutboundEmailReady())) {
      return NextResponse.json(
        {
          message:
            'Восстановление по почте сейчас недоступно. Используйте фразу восстановления в профиле или обратитесь к администратору.',
          emailSkipped: true,
        },
        { status: 503 }
      );
    }

    const identifier = user.email.toLowerCase();
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 час

    // Удаляем старые токены этого юзера, если есть
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token,
        expires
      }
    });

    const { getSiteIdentity } = await import('@/lib/site-identity');
    const { siteName, publicOrigin } = await getSiteIdentity();
    const resetUrl = `${publicOrigin}/reset-password?token=${token}`;

    const sent = await sendEmail(
      identifier,
      'Восстановление пароля',
      `<h1>Восстановление пароля</h1>
      <p>Вы запросили сброс пароля на сайте «${siteName}».</p>
      <p><a href="${resetUrl}">Нажмите здесь, чтобы задать новый пароль</a></p>
      <p>Ссылка действительна в течение 1 часа.</p>`
    );

    if (!sent.success) {
      console.error('[forgot-password] email failed', sent.error);
      return NextResponse.json(
        { message: 'Не удалось отправить письмо. Попробуйте позже или используйте фразу восстановления.', emailSkipped: Boolean(sent.skipped) },
        { status: 503 }
      );
    }

    return NextResponse.json({ message: 'Ок' }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}