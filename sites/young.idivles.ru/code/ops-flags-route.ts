import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  MODULE_FLAG_KEYS,
  MODULE_FLAG_META,
  getModuleFlags,
  setModuleFlags,
  isTechRole,
  type ModuleFlagKey,
} from '@/lib/module-flags';
import { opsFlagsRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isTechRole(session.user.role)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const flags = await getModuleFlags();
  const { prisma } = await import('@/lib/prisma');
  const settings = await prisma.siteSettings
    .findUnique({
      where: { id: '1' },
      select: { maintenanceMessage: true, maintenanceEta: true },
    })
    .catch(() => null);
  return NextResponse.json({
    flags,
    maintenanceMessage: settings?.maintenanceMessage || '',
    maintenanceEta: settings?.maintenanceEta || null,
    meta: MODULE_FLAG_KEYS.map((key) => ({
      key,
      ...MODULE_FLAG_META[key],
      enabled: flags[key] !== false,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isTechRole(session.user.role)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await opsFlagsRateLimiter.checkAsync(`ops:${session.user.id}:${ip}`))) {
    return NextResponse.json(rateLimitJson('Слишком часто'), { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const partial: Partial<Record<ModuleFlagKey, boolean>> = {};

  if (body.allPublic === false) {
    for (const k of MODULE_FLAG_KEYS) {
      if (MODULE_FLAG_META[k].publicKill) partial[k] = false;
    }
  } else if (body.allPublic === true) {
    for (const k of MODULE_FLAG_KEYS) {
      if (MODULE_FLAG_META[k].publicKill) partial[k] = true;
    }
  }

  if (body.flags && typeof body.flags === 'object') {
    for (const k of MODULE_FLAG_KEYS) {
      if (typeof body.flags[k] === 'boolean') partial[k] = body.flags[k];
    }
  }

  if (typeof body.maintenanceMessage === 'string' || typeof body.maintenanceEta === 'string') {
    const { prisma } = await import('@/lib/prisma');
    await prisma.siteSettings.update({
      where: { id: '1' },
      data: {
        ...(typeof body.maintenanceMessage === 'string'
          ? { maintenanceMessage: body.maintenanceMessage.slice(0, 2000) }
          : {}),
        ...(typeof body.maintenanceEta === 'string'
          ? { maintenanceEta: body.maintenanceEta.slice(0, 200) }
          : {}),
      },
    });
  }

  const result = await setModuleFlags(partial, session.user.id);
  return NextResponse.json({ ok: true, ...result });
}
