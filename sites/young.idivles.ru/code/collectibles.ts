/**
 * Коллекционные карточки в духе Steam Inventory:
 * паки за эко-баллы → дроп по редкости → витрина на профиле.
 */
export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type CollectibleCard = {
  id: string;
  title: string;
  series: string;
  rarity: CardRarity;
  /** Короткий слоган */
  tagline: string;
  /** CSS accent */
  accent: string;
  /** Эмодзи / символ на лице карты */
  glyph: string;
};

export type CardPackId = 'starter' | 'sochi' | 'keeper';

export type CardPack = {
  id: CardPackId;
  label: string;
  cost: number;
  cards: number;
  blurb: string;
  /** Веса редкостей */
  weights: Record<CardRarity, number>;
};

export type CollectiblesState = {
  /** cardId → count */
  cards: Record<string, number>;
  /** до 5 id на витрине */
  showcase: string[];
  packsOpened: number;
  updatedAt?: string;
};

export const RARITY_META: Record<
  CardRarity,
  { label: string; color: string; glow: string; order: number }
> = {
  common: { label: 'Обычная', color: '#94a3b8', glow: 'rgba(148,163,184,0.35)', order: 1 },
  uncommon: { label: 'Необычная', color: '#34d399', glow: 'rgba(52,211,153,0.4)', order: 2 },
  rare: { label: 'Редкая', color: '#38bdf8', glow: 'rgba(56,189,248,0.45)', order: 3 },
  epic: { label: 'Эпическая', color: '#c084fc', glow: 'rgba(192,132,252,0.5)', order: 4 },
  legendary: { label: 'Легендарная', color: '#fbbf24', glow: 'rgba(251,191,36,0.55)', order: 5 },
};

/** Каталог — молодёжный Сочи, эко, афиша, игры */
export const COLLECTIBLE_CARDS: CollectibleCard[] = [
  { id: 'sea_breeze', title: 'Морской бриз', series: 'Сочи', rarity: 'common', tagline: 'Соль на губах', accent: '#0ea5e9', glyph: '🌊' },
  { id: 'palm_walk', title: 'Пальмовая аллея', series: 'Сочи', rarity: 'common', tagline: 'Тень и лето', accent: '#22c55e', glyph: '🌴' },
  { id: 'night_embankment', title: 'Набережная ночью', series: 'Сочи', rarity: 'uncommon', tagline: 'Огни у воды', accent: '#6366f1', glyph: '🌃' },
  { id: 'rosa_peak', title: 'Роза Хутор', series: 'Сочи', rarity: 'rare', tagline: 'Выше облаков', accent: '#38bdf8', glyph: '🏔' },
  { id: 'olympic_park', title: 'Олимпийский парк', series: 'Сочи', rarity: 'rare', tagline: 'Большая сцена', accent: '#f59e0b', glyph: '🏟' },
  { id: 'volunteering', title: 'Волонтёр дня', series: 'Сообщество', rarity: 'uncommon', tagline: 'Руки в деле', accent: '#14b8a6', glyph: '🤝' },
  { id: 'club_night', title: 'Вечер в клубе', series: 'Сообщество', rarity: 'common', tagline: 'Свои люди', accent: '#a855f7', glyph: '🎧' },
  { id: 'project_spark', title: 'Искра проекта', series: 'Сообщество', rarity: 'rare', tagline: 'Идея → действие', accent: '#f472b6', glyph: '💡' },
  { id: 'stage_light', title: 'Свет сцены', series: 'Афиша', rarity: 'uncommon', tagline: 'Аншлаг', accent: '#fb7185', glyph: '🎤' },
  { id: 'qr_checkin', title: 'QR на входе', series: 'Афиша', rarity: 'common', tagline: 'Вы на месте', accent: '#94a3b8', glyph: '📱' },
  { id: 'host_pass', title: 'Хозяин площадки', series: 'Афиша', rarity: 'epic', tagline: 'Ключи от зала', accent: '#c084fc', glyph: '🔑' },
  { id: 'leaf_care', title: 'Зелёный жест', series: 'Эко', rarity: 'common', tagline: 'Забота рядом', accent: '#22c55e', glyph: '🍃' },
  { id: 'clean_shore', title: 'Чистый берег', series: 'Эко', rarity: 'uncommon', tagline: 'Субботник', accent: '#10b981', glyph: '🧹' },
  { id: 'planet_keeper', title: 'Хранитель планеты', series: 'Эко', rarity: 'legendary', tagline: 'Максимум заботы', accent: '#fbbf24', glyph: '🌍' },
  { id: 'snake_run', title: 'Змейка-спринт', series: 'Игры', rarity: 'common', tagline: 'Ещё один рекорд', accent: '#22c55e', glyph: '🐍' },
  { id: 'tetris_flow', title: 'Тетрис-флоу', series: 'Игры', rarity: 'uncommon', tagline: 'Линии сыплются', accent: '#3b82f6', glyph: '🧱' },
  { id: 'fifteen_master', title: 'Мастер пятнашек', series: 'Игры', rarity: 'rare', tagline: 'Порядок из хаоса', accent: '#06b6d4', glyph: '🧩' },
  { id: 'arcade_heart', title: 'Сердце аркады', series: 'Игры', rarity: 'epic', tagline: 'Игровой зал портала', accent: '#ef4444', glyph: '🕹' },
  { id: 'young_crest', title: 'Герб молодёжи', series: 'Легенды', rarity: 'legendary', tagline: 'Символ портала', accent: '#f59e0b', glyph: '🏛' },
  { id: 'sochi_sunrise', title: 'Рассвет Сочи', series: 'Легенды', rarity: 'legendary', tagline: 'Новый день города', accent: '#fb923c', glyph: '🌅' },
];

export const CARD_BY_ID: Record<string, CollectibleCard> = Object.fromEntries(
  COLLECTIBLE_CARDS.map((c) => [c.id, c])
);

export const CARD_PACKS: Record<CardPackId, CardPack> = {
  starter: {
    id: 'starter',
    label: 'Стартовый пак',
    cost: 35,
    cards: 3,
    blurb: '3 карты · чаще обычные',
    weights: { common: 55, uncommon: 30, rare: 12, epic: 2.5, legendary: 0.5 },
  },
  sochi: {
    id: 'sochi',
    label: 'Пак «Сочи»',
    cost: 75,
    cards: 5,
    blurb: '5 карт · городской вайб',
    weights: { common: 40, uncommon: 32, rare: 20, epic: 6, legendary: 2 },
  },
  keeper: {
    id: 'keeper',
    label: 'Пак «Хранитель»',
    cost: 140,
    cards: 5,
    blurb: '5 карт · выше шанс редких',
    weights: { common: 22, uncommon: 30, rare: 28, epic: 14, legendary: 6 },
  },
};

export function emptyCollectibles(): CollectiblesState {
  return { cards: {}, showcase: [], packsOpened: 0 };
}

export function parseCollectibles(raw: unknown): CollectiblesState {
  if (!raw) return emptyCollectibles();
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return emptyCollectibles();
    const cards: Record<string, number> = {};
    const src = (data as { cards?: unknown }).cards;
    if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        if (!CARD_BY_ID[k]) continue;
        const n = Math.floor(Number(v) || 0);
        if (n > 0) cards[k] = Math.min(999, n);
      }
    }
    const showcase = Array.isArray((data as { showcase?: unknown }).showcase)
      ? (data as { showcase: unknown[] }).showcase
          .map((x) => String(x))
          .filter((id) => CARD_BY_ID[id] && cards[id])
          .slice(0, 5)
      : [];
    const packsOpened = Math.max(0, Math.floor(Number((data as { packsOpened?: unknown }).packsOpened) || 0));
    return { cards, showcase, packsOpened };
  } catch {
    return emptyCollectibles();
  }
}

export function collectiblesValue(state: CollectiblesState): number {
  let sum = 0;
  for (const [id, count] of Object.entries(state.cards)) {
    const card = CARD_BY_ID[id];
    if (!card) continue;
    const unit =
      card.rarity === 'legendary'
        ? 80
        : card.rarity === 'epic'
          ? 45
          : card.rarity === 'rare'
            ? 25
            : card.rarity === 'uncommon'
              ? 12
              : 6;
    sum += unit * count;
  }
  return sum;
}

export function uniqueCardCount(state: CollectiblesState): number {
  return Object.keys(state.cards).length;
}

function pickRarity(weights: Record<CardRarity, number>): CardRarity {
  const entries = Object.entries(weights) as [CardRarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rar, w] of entries) {
    r -= w;
    if (r <= 0) return rar;
  }
  return 'common';
}

function pickCardOfRarity(rarity: CardRarity): CollectibleCard {
  const pool = COLLECTIBLE_CARDS.filter((c) => c.rarity === rarity);
  if (!pool.length) return COLLECTIBLE_CARDS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function rollPack(packId: CardPackId): CollectibleCard[] {
  const pack = CARD_PACKS[packId];
  if (!pack) return [];
  const out: CollectibleCard[] = [];
  for (let i = 0; i < pack.cards; i++) {
    out.push(pickCardOfRarity(pickRarity(pack.weights)));
  }
  return out;
}

export function applyDrops(state: CollectiblesState, drops: CollectibleCard[]): CollectiblesState {
  const cards = { ...state.cards };
  for (const d of drops) {
    cards[d.id] = Math.min(999, (cards[d.id] || 0) + 1);
  }
  return {
    ...state,
    cards,
    packsOpened: state.packsOpened + 1,
    updatedAt: new Date().toISOString(),
  };
}
