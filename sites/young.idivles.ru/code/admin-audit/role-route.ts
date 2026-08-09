import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sanitizePermissions } from '@/lib/acl';
import { logAdminAction } from '@/lib/admin-audit';

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
    }

    const body = await req.json();
    const { role, permissions } = body;
    const allowed = ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN', 'SCANNER'];
    if (!allowed.includes(role)) {
      return NextResponse.json({ message: 'Некорректная роль' }, { status: 400 });
    }

    // Prevent accidental self-lockout from demoting the last admin
    if (session.user.id === params.id && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { message: 'Нельзя снять права с единственного администратора' },
          { status: 400 }
        );
      }
    }

    const cleanPermissions = role === 'MODERATOR' ? sanitizePermissions(permissions) : null;
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true },
    });
    const elevatingToStaff =
      ['ADMIN', 'MODERATOR', 'SCANNER'].includes(role) && target?.role !== role;

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        role,
        permissions: cleanPermissions || null,
        ...(elevatingToStaff ? { mustChangePassword: true } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        mustChangePassword: true,
      },
    });

    await logAdminAction({
      actorId: session.user.id!,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: 'USER_ROLE_CHANGE',
      targetType: 'User',
      targetId: user.id,
      targetEmail: user.email,
      detail: {
        fromRole: target?.role || null,
        toRole: role,
        permissions: cleanPermissions,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Ошибка обновления прав:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
