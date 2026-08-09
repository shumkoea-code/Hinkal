import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import {
  openCardPack,
  setCardShowcase,
  parseCosmetics,
  cosmeticsCatalogValue,
} from '@/lib/eco-points';
import {
  CARD_BY_ID,
  CARD_PACKS,
  COLLECTIBLE_CARDS,
  RARITY_META,
  collectiblesValue,
  parseCollectibles,
  uniqueCardCount,
} from '@/lib/collectibles';
import {
  profileContribution,
  profileLevelProgress,
} from '@/lib/profile-level';
import { evaluateAchievements } from '@/lib/award-achievements';
import { placesRateLimiter, rateLimitJson } from '@/lib/rateLimit';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open_pack'),
    packId: z.enum(['starter', 'sochi', 'keeper']),
  }),
  z.object({
    action: z.literal('showcase'),
    showcase: z.array(z.string().min(1).max(64)).max(5),
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
      select: { ecoPoints: true, cosmeticsJson: true, collectiblesJson: true },
    });
    const owned = parseCosmetics(user?.cosmeticsJson);
    const collectibles = parseCollectibles(user?.collectiblesJson);
    const contribution = profileContribution({
      ecoPoints: user?.ecoPoints ?? 0,
      cosmeticsValue: cosmeticsCatalogValue(owned),
      collectiblesValue: collectiblesValue(collectibles),
    });
    const level = profileLevelProgress(contribution);

    const inventory = Object.entries(collectibles.cards)
      .map(([id, count]) => {
        const card = CARD_BY_ID[id];
        if (!card) return null;
        return {
          ...card,
          count,
          rarityMeta: RARITY_META[card.rarity],
          inShowcase: collectibles.showcase.includes(id),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ra = RARITY_META[a!.rarity].order;
        const rb = RARITY_META[b!.rarity].order;
        if (rb !== ra) return rb - ra;
        return a!.title.localeCompare(b!.title, 'ru');
      });

    return NextResponse.json({
      ecoPoints: user?.ecoPoints ?? 0,
      collectibles,
      inventory,
      catalog: COLLECTIBLE_CARDS.map((c) => ({
        ...c,
        rarityMeta: RARITY_META[c.rarity],
        owned: collectibles.cards[c.id] || 0,
      })),
      packs: Object.values(CARD_PACKS).map((p) => ({
        ...p,
        affordable: (user?.ecoPoints ?? 0) >= p.cost,
      })),
      level,
      uniqueCount: uniqueCardCount(collectibles),
      totalCards: Object.values(collectibles.cards).reduce((s, n) => s + n, 0),
      setSize: COLLECTIBLE_CARDS.length,
    });
  } catch (e) {
    console.error('GET /api/user/collectibles', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }
    if (!(await placesRateLimiter.checkAsync(`cards:${session.user.id}`, 20))) {
      return NextResponse.json(rateLimitJson('Слишком часто. Подождите.'), { status: 429 });
    }
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
    }

    if (parsed.data.action === 'open_pack') {
      const result = await openCardPack(session.user.id, parsed.data.packId);
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: 400 });
      }
      void evaluateAchievements(session.user.id).catch(() => null);
      return NextResponse.json({
        ok: true,
        ecoPoints: result.ecoPoints,
        collectibles: result.collectibles,
        drops: result.drops,
        pack: result.pack,
      });
    }

    const result = await setCardShowcase(session.user.id, parsed.data.showcase);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    void evaluateAchievements(session.user.id).catch(() => null);
    return NextResponse.json({ ok: true, collectibles: result.collectibles });
  } catch (e) {
    console.error('POST /api/user/collectibles', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
