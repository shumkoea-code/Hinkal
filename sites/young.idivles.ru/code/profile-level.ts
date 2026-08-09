/**
 * Уровень профиля — прогрессия «Центра развития молодежи Сочи».
 * Смысл: чем больше участия (эко-вклад, косметика, коллекция), тем выше статус в сообществе.
 */
export type ProfileLevel = {
  level: number;
  id: string;
  title: string;
  blurb: string;
  color: string;
  min: number;
  next?: number;
};

/** Пороги по «вкладу» (эко на руках + стоимость купленного + ценность коллекции). */
const LEVELS: Omit<ProfileLevel, 'next'>[] = [
  { level: 1, id: 'newcomer', title: 'Новичок', blurb: 'Только зашли на портал', color: '#94a3b8', min: 0 },
  { level: 2, id: 'sprout', title: 'Росток', blurb: 'Первые шаги и эко-баллы', color: '#22c55e', min: 25 },
  { level: 3, id: 'member', title: 'Участник', blurb: 'В афише и сообществах', color: '#38bdf8', min: 60 },
  { level: 4, id: 'volunteer', title: 'Волонтёр', blurb: 'Помогаете событиям жить', color: '#2dd4bf', min: 120 },
  { level: 5, id: 'activist', title: 'Активист', blurb: 'Регулярно в деле', color: '#60a5fa', min: 200 },
  { level: 6, id: 'navigator', title: 'Навигатор', blurb: 'Ориентир для друзей', color: '#818cf8', min: 320 },
  { level: 7, id: 'ambassador', title: 'Амбассадор', blurb: 'Лицо молодёжного Сочи', color: '#a78bfa', min: 480 },
  { level: 8, id: 'keeper', title: 'Хранитель', blurb: 'Забота о портале и городе', color: '#34d399', min: 700 },
  { level: 9, id: 'captain', title: 'Капитан', blurb: 'Ведёте за собой', color: '#fbbf24', min: 1000 },
  { level: 10, id: 'legend', title: 'Легенда портала', blurb: 'Максимальный вклад', color: '#fb7185', min: 1500 },
];

export function profileContribution(opts: {
  ecoPoints: number;
  cosmeticsValue?: number;
  collectiblesValue?: number;
}): number {
  return Math.max(
    0,
    (opts.ecoPoints || 0) + (opts.cosmeticsValue || 0) + (opts.collectiblesValue || 0)
  );
}

export function profileLevel(contribution: number): ProfileLevel {
  const c = Math.max(0, contribution);
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (c >= lvl.min) current = lvl;
  }
  const idx = LEVELS.findIndex((l) => l.id === current.id);
  const nextMin = LEVELS[idx + 1]?.min;
  return { ...current, next: nextMin };
}

export function profileLevelProgress(contribution: number) {
  const level = profileLevel(contribution);
  const nextAt = level.next ?? level.min;
  const prevAt = level.min;
  const span = Math.max(1, nextAt - prevAt);
  const pct = level.next
    ? Math.min(100, Math.round(((contribution - prevAt) / span) * 100))
    : 100;
  return { level, pct, nextAt: level.next, contribution };
}

/** Обратная совместимость со старыми «эко-тирами». */
export function ecoTier(points: number) {
  const lvl = profileLevel(points);
  return {
    id: lvl.id,
    label: lvl.title,
    color: lvl.color,
    min: lvl.min,
    next: lvl.next,
  };
}

export function ecoTierProgress(points: number) {
  const { level: lvl, pct, nextAt } = profileLevelProgress(points);
  return {
    tier: {
      id: lvl.id,
      label: lvl.title,
      color: lvl.color,
      min: lvl.min,
      next: lvl.next,
    },
    pct,
    nextAt,
  };
}

export const ECO_EARN_HINTS = [
  { action: 'Отметка на входе (QR)', points: 15 },
  { action: 'Запись на мероприятие', points: 5 },
  { action: 'Принятие заявки / клуб', points: 8 },
  { action: 'Новый друг', points: 6 },
  { action: 'Фото в галерею', points: 4 },
  { action: 'Инструктаж пройден', points: 20 },
  { action: 'Отклик на вакансию (скрининг)', points: 10 },
  { action: 'Одобрение вакансии', points: 25 },
  { action: 'Работа на конкурс', points: 8 },
  { action: 'Одобрение работы / победа', points: 12 },
  { action: 'Победа в розыгрыше', points: 40 },
  { action: 'Игра (раз в сутки МСК)', points: 5 },
  { action: 'Победа в «Пятнашках»', points: 8 },
  { action: 'Уникальный просмотр карточки (до 15/день)', points: 1 },
] as const;

export const PROFILE_LEVELS = LEVELS;
