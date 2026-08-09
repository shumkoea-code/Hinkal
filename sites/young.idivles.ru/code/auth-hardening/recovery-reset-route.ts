import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { recoveryPhraseRateLimiter } from '@/lib/rateLimit';
import {
  RECOVERY_PHRASE_WORDS,
  splitRecoveryWords,
  validateRecoveryWords,
  verifyRecoveryPhrase,
} from '@/lib/recovery-phrase';

const schema = z.object({
  email: z.string().email('Укажите email').transform((v) => v.trim().toLowerCase()),
  phrase: z.string().min(10, 'Введите фразу из 24 слов'),
  password: z.string().min(8, 'Пароль должен быть минимум 8 символов').max(100),
});

/**
 * Reset password using the offline 24-word Russian recovery phrase.
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!await recoveryPhraseRateLimiter.checkAsync(`phrase:${ip}`)) {
      return NextResponse.json(
        { message: 'Слишком много попыток. Подождите 15 минут.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message || 'Некорректные данные' },
        { status: 400 }
      );
    }

    const { email, phrase, password } = parsed.data;
    const words = splitRecoveryWords(phrase);
    const wordCheck = validateRecoveryWords(words);
    if (!wordCheck.ok) {
      return NextResponse.json({ message: wordCheck.message }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        recoveryPhraseHash: true,
        blockedAt: true,
        deletedAt: true,
      },
    });

    // Same generic error whether user/phrase missing — avoid account enumeration
    const fail = () =>
      NextResponse.json(
        { message: 'Неверный email или фраза восстановления' },
        { status: 400 }
      );

    if (!user || user.deletedAt || user.blockedAt || !user.recoveryPhraseHash) {
      return fail();
    }

    if (!await recoveryPhraseRateLimiter.checkAsync(`phrase:user:${user.id}`)) {
      return NextResponse.json(
        { message: 'Слишком много попыток для этого аккаунта. Подождите.' },
        { status: 429 }
      );
    }

    const ok = await verifyRecoveryPhrase(words, user.recoveryPhraseHash);
    if (!ok) return fail();

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        // Keep the same phrase valid; user can rotate it after login
        tokenVersion: { increment: 1 },
        tokenKeepAlive: null,
      },
    });

    return NextResponse.json({
      message: 'Пароль изменён. Войдите с новым паролем.',
      wordCount: RECOVERY_PHRASE_WORDS,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
