/**
 * Eco-points («Забота о планете») — earn for good actions, spend on cosmetics & packs.
 */
import { prisma } from '@/lib/prisma';
import { logReputationEvent } from '@/lib/reputation-history';
import {
  LOADOUT_SLOTS,
  parseEcoLoadout,
  type CosmeticSlot,
  type EcoLoadout,
} from '@/lib/eco-loadout';
import {
  applyDrops,
  CARD_PACKS,
  parseCollectibles,
  rollPack,
  type CardPackId,
  type CollectibleCard,
} from '@/lib/collectibles';

export type { CosmeticSlot, EcoLoadout } from '@/lib/eco-loadout';
export { parseEcoLoadout, SLOT_LABELS, LOADOUT_SLOTS } from '@/lib/eco-loadout';

export type CosmeticItem = {
  cost: number;
  label: string;
  slot: CosmeticSlot;
};

export const ECO = {
  MIN: 0,
  MAX: 1_000_000,
  CHECK_IN: 15,
  JOIN_EVENT: 5,
  FRIEND_ACCEPT: 6,
  GALLERY_PHOTO: 4,
  APPLICATION_APPROVED: 8,
  ACHIEVEMENT: 6,
  GUIDE_COMPLETE: 20,
  VACANCY_SCREEN_PASS: 10,
  VACANCY_APPROVED: 25,
  CONTEST_SUBMIT: 8,
  CONTEST_APPROVED: 12,
  CONTEST_WIN: 35,
  RAFFLE_WIN: 40,
  /** Once per MSK calendar day for verified game play */
  GAME_DAILY: 5,
  /** Bonus for solving fifteen puzzle (once per MSK day, stacks with GAME_DAILY) */
  FIFTEEN_WIN: 8,
  /** +1 per unique content view (logged-in), capped per MSK day */
  VIEW_UNIQUE: 1,
  VIEW_DAILY_CAP: 15,
  /** Referral program (see lib/referrals.ts for full matrix) */
  REFERRAL_SIGNUP: 8,
  REFERRAL_CHECKIN: 25,
  /** Spend catalog */
  COSMETICS: {
    frame_ocean: { cost: 35, label: 'Рамка «Океан»', slot: 'frame' },
    frame_forest: { cost: 35, label: 'Рамка «Лес»', slot: 'frame' },
    frame_gold: { cost: 55, label: 'Рамка «Золото»', slot: 'frame' },
    frame_neon: { cost: 70, label: 'Рамка «Неон»', slot: 'frame' },
    frame_cyber: { cost: 85, label: 'Рамка «Кибер»', slot: 'frame' },
    badge_leaf: { cost: 20, label: 'Значок «Лист»', slot: 'badge' },
    badge_star: { cost: 30, label: 'Значок «Звезда»', slot: 'badge' },
    badge_wave: { cost: 28, label: 'Значок «Волна»', slot: 'badge' },
    badge_fire: { cost: 42, label: 'Значок «Огонь»', slot: 'badge' },
    theme_aurora: { cost: 70, label: 'Тема профиля «Аврора»', slot: 'theme' },
    theme_forest: { cost: 90, label: 'Тема профиля «Лес»', slot: 'theme' },
    theme_nightcity: { cost: 110, label: 'Тема «Ночной город»', slot: 'theme' },
    theme_harbor: { cost: 95, label: 'Тема «Гавань»', slot: 'theme' },
    ticket_glow: { cost: 40, label: 'Подсветка QR билета', slot: 'ticket' },
    ticket_holo: { cost: 75, label: 'Голографический билет', slot: 'ticket' },
    voice_slavonic: { cost: 55, label: 'Голос: старославянский', slot: 'voice' },
    voice_punk: { cost: 50, label: 'Голос: панк-сленг', slot: 'voice' },
    voice_elite: { cost: 70, label: 'Голос: элитный тон', slot: 'voice' },
    voice_sochi: { cost: 45, label: 'Голос: сочинский', slot: 'voice' },
    voice_youth: { cost: 60, label: 'Голос: молодёжный', slot: 'voice' },
    aura_spark: { cost: 55, label: 'Аура «Искры» у аватара', slot: 'aura' },
    aura_wave: { cost: 65, label: 'Аура «Прибой»', slot: 'aura' },
    banner_sunset: { cost: 65, label: 'Шапка профиля «Закат»', slot: 'banner' },
    banner_sochi: { cost: 80, label: 'Шапка «Сочи 24»', slot: 'banner' },
    cursor_leaf: { cost: 40, label: 'Курсор «Лист»', slot: 'cursor' },
    cursor_star: { cost: 48, label: 'Курсор «Звезда»', slot: 'cursor' },
  } as Record<string, CosmeticItem>,
} as const;

export type CosmeticId = keyof typeof ECO.COSMETICS;

export function parseCosmetics(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.map((x) => String(x)).filter(Boolean).slice(0, 64);
  } catch {
    return [];
  }
}

export function cosmeticsCatalogValue(owned: string[]): number {
  let sum = 0;
  for (const id of owned) {
    const item = ECO.COSMETICS[id as CosmeticId];
    if (item) sum += item.cost;
  }
  return sum;
}

export function cosmeticSlot(id: string): CosmeticSlot | null {
  const item = ECO.COSMETICS[id as CosmeticId];
  return item?.slot ?? null;
}

export async function bumpEcoPoints(
  userId: string,
  delta: number,
  reason: string,
  meta?: Record<string, unknown>
) {
  if (!delta) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true },
  });
  if (!user) return null;

  let applied = delta;
  if (delta > 0) {
    try {
      const { ecoPoolRemaining } = await import('@/lib/eco-pool');
      const remaining = await ecoPoolRemaining();
      if (remaining <= 0) return null;
      applied = Math.min(delta, remaining);
    } catch {
      /* pool check best-effort — don't block legacy awards */
    }
  }
  if (!applied) return null;

  const next = Math.max(ECO.MIN, Math.min(ECO.MAX, (user.ecoPoints ?? 0) + applied));
  const actualDelta = next - (user.ecoPoints ?? 0);
  if (!actualDelta) return null;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ecoPoints: next },
    select: { id: true, ecoPoints: true },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: actualDelta,
    balanceAfter: next,
    reason,
    meta,
  });
  return updated;
}

/**
 * Admin / contest grant with explicit pool remaining check and user-facing errors.
 */
export async function grantEcoPoints(
  userId: string,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>
): Promise<{ ok: true; ecoPoints: number } | { ok: false; message: string }> {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: 'Сумма должна быть ≥ 1' };
  }
  if (n > 50_000) {
    return { ok: false, message: 'За раз не больше 50 000' };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return { ok: false, message: 'Пользователь не найден' };
  }

  try {
    const { ecoPoolRemaining } = await import('@/lib/eco-pool');
    const remaining = await ecoPoolRemaining();
    if (remaining < n) {
      return {
        ok: false,
        message: `В пуле осталось ${remaining.toLocaleString('ru-RU')} — меньше, чем ${n}`,
      };
    }
  } catch {
    /* continue without hard fail if pool module unavailable */
  }

  const next = Math.max(ECO.MIN, Math.min(ECO.MAX, (user.ecoPoints ?? 0) + n));
  const actual = next - (user.ecoPoints ?? 0);
  if (actual < 1) {
    return { ok: false, message: 'Достигнут лимит баланса пользователя' };
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ecoPoints: next },
    select: { ecoPoints: true },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: actual,
    balanceAfter: next,
    reason,
    meta: { ...meta, grant: true },
  });
  return { ok: true, ecoPoints: updated.ecoPoints };
}

export async function spendEcoPoints(userId: string, cosmeticId: string) {
  const item = ECO.COSMETICS[cosmeticId as CosmeticId];
  if (!item) return { ok: false as const, message: 'Неизвестный предмет' };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true, cosmeticsJson: true, ecoLoadoutJson: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const owned = parseCosmetics(user.cosmeticsJson);
  if (owned.includes(cosmeticId)) return { ok: false as const, message: 'Уже куплено' };
  if ((user.ecoPoints ?? 0) < item.cost) {
    return { ok: false as const, message: `Нужно ${item.cost} эко-баллов` };
  }
  const nextPoints = (user.ecoPoints ?? 0) - item.cost;
  const nextOwned = [...owned, cosmeticId];
  // Auto-equip on purchase so voice/theme apply immediately (fixes «язык не меняется»)
  const loadout = parseEcoLoadout(user.ecoLoadoutJson);
  loadout[item.slot] = cosmeticId;
  await prisma.user.update({
    where: { id: userId },
    data: {
      ecoPoints: nextPoints,
      cosmeticsJson: JSON.stringify(nextOwned),
      ecoLoadoutJson: JSON.stringify(loadout),
    },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: -item.cost,
    balanceAfter: nextPoints,
    reason: `Покупка: ${item.label}`,
    meta: { cosmeticId, autoEquipped: true },
  });
  return {
    ok: true as const,
    ecoPoints: nextPoints,
    cosmetics: nextOwned,
    loadout,
  };
}

export async function openCardPack(userId: string, packId: string) {
  if (!(packId in CARD_PACKS)) {
    return { ok: false as const, message: 'Неизвестный пак' };
  }
  const pack = CARD_PACKS[packId as CardPackId];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ecoPoints: true, collectiblesJson: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  if ((user.ecoPoints ?? 0) < pack.cost) {
    return { ok: false as const, message: `Нужно ${pack.cost} эко-баллов` };
  }
  const drops = rollPack(pack.id);
  const prev = parseCollectibles(user.collectiblesJson);
  const nextState = applyDrops(prev, drops);
  const nextPoints = (user.ecoPoints ?? 0) - pack.cost;
  await prisma.user.update({
    where: { id: userId },
    data: {
      ecoPoints: nextPoints,
      collectiblesJson: JSON.stringify(nextState),
    },
  });
  await logReputationEvent({
    userId,
    kind: 'ECO',
    delta: -pack.cost,
    balanceAfter: nextPoints,
    reason: `Пак: ${pack.label}`,
    meta: { packId: pack.id, drops: drops.map((d) => d.id) },
  });
  return {
    ok: true as const,
    ecoPoints: nextPoints,
    collectibles: nextState,
    drops,
    pack,
  };
}

export async function setCardShowcase(userId: string, showcase: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { collectiblesJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const state = parseCollectibles(user.collectiblesJson);
  const nextShowcase = showcase
    .map((x) => String(x))
    .filter((id) => state.cards[id])
    .slice(0, 5);
  const next = { ...state, showcase: nextShowcase, updatedAt: new Date().toISOString() };
  await prisma.user.update({
    where: { id: userId },
    data: { collectiblesJson: JSON.stringify(next) },
  });
  return { ok: true as const, collectibles: next, ecoPoints: user.ecoPoints ?? 0 };
}

export async function equipCosmetic(userId: string, cosmeticId: string) {
  const item = ECO.COSMETICS[cosmeticId as CosmeticId];
  if (!item) return { ok: false as const, message: 'Неизвестный предмет' };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cosmeticsJson: true, ecoLoadoutJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const owned = parseCosmetics(user.cosmeticsJson);
  if (!owned.includes(cosmeticId)) {
    return { ok: false as const, message: 'Сначала купите этот предмет' };
  }
  const loadout = parseEcoLoadout(user.ecoLoadoutJson);
  loadout[item.slot] = cosmeticId;
  await prisma.user.update({
    where: { id: userId },
    data: { ecoLoadoutJson: JSON.stringify(loadout) },
  });
  return {
    ok: true as const,
    ecoPoints: user.ecoPoints ?? 0,
    cosmetics: owned,
    loadout,
  };
}

export async function unequipCosmetic(userId: string, slot: string) {
  if (!LOADOUT_SLOTS.includes(slot as CosmeticSlot)) {
    return { ok: false as const, message: 'Неизвестный слот' };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cosmeticsJson: true, ecoLoadoutJson: true, ecoPoints: true },
  });
  if (!user) return { ok: false as const, message: 'Пользователь не найден' };
  const loadout = parseEcoLoadout(user.ecoLoadoutJson);
  loadout[slot as CosmeticSlot] = null;
  await prisma.user.update({
    where: { id: userId },
    data: { ecoLoadoutJson: JSON.stringify(loadout) },
  });
  return {
    ok: true as const,
    ecoPoints: user.ecoPoints ?? 0,
    cosmetics: parseCosmetics(user.cosmeticsJson),
    loadout,
  };
}

export type { CollectibleCard };
