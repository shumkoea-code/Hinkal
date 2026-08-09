import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { newTokenKeepAlive } from '@/lib/content-moderation';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  currentPassword: z.string().min(1, 'Укажите текущий пароль'),
  newPassword: z.string().min(8, 'Новый пароль — минимум 8 символов').max(100),
});

/** Forced / voluntary password change. Clears mustChangePassword; keeps current session via keepAlive. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || 'Ошибка' }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return NextResponse.json({ message: 'Новый пароль должен отличаться от текущего' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, deletedAt: true, blockedAt: true },
  });
  if (!user?.password || user.deletedAt || user.blockedAt) {
    return NextResponse.json({ message: 'Смена пароля недоступна' }, { status: 400 });
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    return NextResponse.json({ message: 'Неверный текущий пароль' }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const keepAlive = newTokenKeepAlive();
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      password: hash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
      tokenKeepAlive: keepAlive,
    },
  });

  return NextResponse.json({
    ok: true,
    keepAlive,
    message: 'Пароль обновлён. Другие сессии завершены.',
  });
}
