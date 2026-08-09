import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import { createUserNotification, recordLoginEvent } from '@/lib/security';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === 'unblock' ? 'unblock' : 'block';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  if (action === 'block') {
    await prisma.user.update({
      where: { id },
      data: {
        blockedAt: new Date(),
        blockedReason: reason || 'Нарушение правил сайта',
        tokenVersion: { increment: 1 },
      },
    });
    await recordLoginEvent({ userId: id, kind: 'BLOCKED_ATTEMPT', success: false });
    await createUserNotification({
      userId: id,
      type: 'SECURITY',
      title: 'Аккаунт заблокирован',
      body: reason || 'Доступ ограничен администрацией. См. правила сайта.',
    });
  } else {
    await prisma.user.update({
      where: { id },
      data: { blockedAt: null, blockedReason: null },
    });
    await createUserNotification({
      userId: id,
      type: 'SECURITY',
      title: 'Блокировка снята',
      body: 'Доступ к порталу восстановлен.',
    });
  }

  await logAdminAction({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: action === 'block' ? 'USER_BLOCK' : 'USER_UNBLOCK',
    targetType: 'User',
    targetId: target.id,
    targetEmail: target.email,
    detail: {
      reason: action === 'block' ? reason || 'Нарушение правил сайта' : null,
      targetName: target.name,
      targetRole: target.role,
    },
  });

  return NextResponse.json({ ok: true });
}
