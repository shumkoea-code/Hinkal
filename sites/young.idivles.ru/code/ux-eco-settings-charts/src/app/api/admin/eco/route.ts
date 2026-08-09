import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { grantEcoPoints, bumpEcoPoints } from '@/lib/eco-points';
import { getEcoPoolStats, parseEcoPoolJson, serializeEcoPoolJson } from '@/lib/eco-pool';
import { prisma } from '@/lib/prisma';
import { createUserNotification } from '@/lib/security';

const grantSchema = z.object({
  action: z.literal('grant'),
  userId: z.string().min(1).max(64).optional(),
  publicCode: z.string().min(2).max(32).optional(),
  amount: z.number().int().min(1).max(50_000),
  reason: z.string().min(3).max(200).optional(),
});

const poolSchema = z.object({
  action: z.literal('savePool'),
  total: z.number().int().min(1000).max(100_000_000).optional(),
  showInShop: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const stats = await getEcoPoolStats();
    return NextResponse.json({ pool: stats });
  } catch (e) {
    return aclJsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const action = String((raw as { action?: string }).action || '');

    if (action === 'grant') {
      const parsed = grantSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
      }
      let userId = parsed.data.userId || '';
      if (!userId && parsed.data.publicCode) {
        const code = parsed.data.publicCode.trim().toUpperCase();
        const u = await prisma.user.findFirst({
          where: {
            OR: [{ publicCode: code }, { publicCode: parsed.data.publicCode.trim() }],
            deletedAt: null,
          },
          select: { id: true, name: true, publicCode: true },
        });
        if (!u) return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
        userId = u.id;
      }
      if (!userId) {
        return NextResponse.json({ message: 'Укажите userId или publicCode' }, { status: 400 });
      }

      const reason = parsed.data.reason?.trim() || 'admin_grant';
      const result = await grantEcoPoints(userId, parsed.data.amount, reason, {
        byAdminId: session.user.id,
      });
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: 400 });
      }

      await createUserNotification({
        userId,
        type: 'SYSTEM',
        title: `+${parsed.data.amount} эко-баллов`,
        body: 'Администратор начислил вам эко-баллы. Загляните в магазин профиля.',
        meta: { href: '/dashboard/profile' },
      }).catch(() => null);

      const pool = await getEcoPoolStats();
      return NextResponse.json({ ok: true, ecoPoints: result.ecoPoints, pool });
    }

    if (action === 'savePool') {
      const parsed = poolSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
      }
      const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const cfg = parseEcoPoolJson((settings as { ecoPoolJson?: string | null } | null)?.ecoPoolJson);
      if (parsed.data.total != null) cfg.total = parsed.data.total;
      if (parsed.data.showInShop != null) cfg.showInShop = parsed.data.showInShop;
      if (parsed.data.showInFooter != null) cfg.showInFooter = parsed.data.showInFooter;
      if (parsed.data.notes != null) cfg.notes = parsed.data.notes;

      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update: { ecoPoolJson: serializeEcoPoolJson(cfg) } as Record<string, unknown>,
        create: { id: '1', ecoPoolJson: serializeEcoPoolJson(cfg) } as Record<string, unknown>,
      });
      const pool = await getEcoPoolStats();
      return NextResponse.json({ ok: true, pool });
    }

    if (action === 'adjust') {
      // Rare: clawback (negative) — still goes through bump with pool awareness for positive only
      const userId = String((raw as { userId?: string }).userId || '');
      const amount = Number((raw as { amount?: number }).amount);
      const reason = String((raw as { reason?: string }).reason || 'admin_adjust').slice(0, 200);
      if (!userId || !Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ message: 'userId и ненулевой amount обязательны' }, { status: 400 });
      }
      if (amount > 0) {
        const r = await grantEcoPoints(userId, Math.floor(amount), reason, {
          byAdminId: session.user.id,
        });
        if (!r.ok) return NextResponse.json({ message: r.message }, { status: 400 });
        return NextResponse.json({ ok: true, ecoPoints: r.ecoPoints });
      }
      const updated = await bumpEcoPoints(userId, Math.floor(amount), reason, {
        byAdminId: session.user.id,
      });
      return NextResponse.json({ ok: true, ecoPoints: updated?.ecoPoints ?? 0 });
    }

    return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return aclJsonError(e);
  }
}
