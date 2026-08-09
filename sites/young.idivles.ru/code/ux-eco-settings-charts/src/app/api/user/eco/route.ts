import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import {
  ECO,
  spendEcoPoints,
  equipCosmetic,
  unequipCosmetic,
  parseCosmetics,
  parseEcoLoadout,
  cosmeticsCatalogValue,
  type CosmeticSlot,
} from '@/lib/eco-points';
import { SLOT_LABELS } from '@/lib/eco-loadout';
import { parseCollectibles, collectiblesValue } from '@/lib/collectibles';
import { profileContribution, profileLevelProgress } from '@/lib/profile-level';
import { evaluateAchievements } from '@/lib/award-achievements';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('buy'),
    cosmeticId: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal('equip'),
    cosmeticId: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal('unequip'),
    slot: z.string().min(1).max(32),
  }),
]);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const { prisma } = await import('@/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ecoPoints: true, cosmeticsJson: true, ecoLoadoutJson: true, collectiblesJson: true },
    });

    const owned = parseCosmetics(user?.cosmeticsJson);
    const loadout = parseEcoLoadout(user?.ecoLoadoutJson);
    const catalog = Object.entries(ECO.COSMETICS).map(([id, item]) => ({
      id,
      label: item.label,
      cost: item.cost,
      slot: item.slot,
      slotLabel: SLOT_LABELS[item.slot as CosmeticSlot],
      owned: owned.includes(id),
      equipped: loadout[item.slot] === id,
    }));

    const col = parseCollectibles(user?.collectiblesJson);
    const contribution = profileContribution({
      ecoPoints: user?.ecoPoints ?? 0,
      cosmeticsValue: cosmeticsCatalogValue(owned),
      collectiblesValue: collectiblesValue(col),
    });
    const level = profileLevelProgress(contribution);

    return NextResponse.json({
      ecoPoints: user?.ecoPoints ?? 0,
      cosmetics: owned,
      loadout,
      catalog,
      level,
      contribution,
    });
  } catch (e) {
    console.error('GET /api/user/eco', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesRateLimiter.checkAsync(`eco:${session.user.id}`, 30))) {
      return NextResponse.json(rateLimitJson('Слишком много покупок. Подождите.'), { status: 429 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
    }

    let result:
      | { ok: true; ecoPoints: number; cosmetics: string[]; loadout: ReturnType<typeof parseEcoLoadout> }
      | { ok: false; message: string };

    if (parsed.data.action === 'buy') {
      result = await spendEcoPoints(session.user.id, parsed.data.cosmeticId);
    } else if (parsed.data.action === 'equip') {
      result = await equipCosmetic(session.user.id, parsed.data.cosmeticId);
    } else {
      result = await unequipCosmetic(session.user.id, parsed.data.slot);
    }

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    void evaluateAchievements(session.user.id).catch(() => null);

    return NextResponse.json({
      ok: true,
      ecoPoints: result.ecoPoints,
      cosmetics: result.cosmetics,
      loadout: result.loadout,
    });
  } catch (e) {
    console.error('POST /api/user/eco', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
