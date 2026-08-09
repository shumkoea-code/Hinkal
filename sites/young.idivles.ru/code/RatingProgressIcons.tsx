'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Gauge, Leaf, Rocket, Sparkles } from 'lucide-react';

export type RatingKind = 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO';

export type RatingItem = {
  kind: RatingKind;
  label: string;
  value: string;
  hint?: string;
  progress: number;
  color: string;
};

const META: Record<
  RatingKind,
  { Icon: typeof Rocket; short: string; defaultColor: string }
> = {
  LEVEL: { Icon: Rocket, short: 'Ур', defaultColor: '#0ea5e9' },
  AUTHORITY: { Icon: Gauge, short: 'А', defaultColor: '#2563eb' },
  SOCIAL: { Icon: Sparkles, short: 'С', defaultColor: '#7c3aed' },
  ECO: { Icon: Leaf, short: 'Э', defaultColor: '#059669' },
};

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ProgressRing({
  progress,
  color,
  size,
  children,
}: {
  progress: number;
  color: string;
  size: number;
  children: ReactNode;
}) {
  const pct = clampPct(progress);
  const stroke = Math.max(2.2, size * 0.1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <span
      className="rating-ring"
      style={
        {
          width: size,
          height: size,
          ['--ring-color' as string]: color,
        } as CSSProperties
      }
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rating-ring__svg">
        <circle
          className="rating-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="rating-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="rating-ring__icon">{children}</span>
    </span>
  );
}

type IconsProps = {
  items: RatingItem[];
  size?: 'sm' | 'md' | 'lg';
  layout?: 'row' | 'grid';
  onSelect?: (kind: RatingKind) => void;
  className?: string;
};

export default function RatingProgressIcons({
  items,
  size = 'md',
  layout = 'grid',
  onSelect,
  className = '',
}: IconsProps) {
  const ringSize = size === 'sm' ? 32 : size === 'lg' ? 46 : 40;
  const iconPx = size === 'sm' ? 12 : size === 'lg' ? 17 : 15;

  return (
    <div
      className={`rating-icons rating-icons--${layout} rating-icons--${size}${className ? ` ${className}` : ''}`}
      aria-label="Рейтинги и прогресс"
    >
      {items.map((item) => {
        const meta = META[item.kind];
        const Icon = meta.Icon;
        const color = item.color || meta.defaultColor;
        const pct = clampPct(item.progress);
        const interactive = Boolean(onSelect);
        const Tag = interactive ? 'button' : 'div';

        return (
          <Tag
            key={item.kind}
            type={interactive ? 'button' : undefined}
            className={`rating-icons__item${interactive ? ' is-clickable' : ''}`}
            style={{ ['--stat-accent' as string]: color } as CSSProperties}
            title={`${item.label}: ${item.value}${item.hint ? ` · ${item.hint}` : ''} · ${pct}%`}
            aria-label={`${item.label} ${item.value}, прогресс ${pct}%`}
            onClick={interactive ? () => onSelect?.(item.kind) : undefined}
          >
            <ProgressRing progress={pct} color={color} size={ringSize}>
              <Icon size={iconPx} strokeWidth={2.4} />
            </ProgressRing>
            <span className="rating-icons__meta">
              <span className="rating-icons__label">{item.label}</span>
              <span className="rating-icons__value">{item.value}</span>
              {item.hint ? <span className="rating-icons__hint">{item.hint}</span> : null}
              <span className="rating-icons__bar" aria-hidden>
                <span className="rating-icons__bar-fill" style={{ width: `${pct}%` }} />
              </span>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** Компактные кольца в одну строку — меню / сайдбар / шапка профиля. */
export function RatingProgressChips({
  items,
  onSelect,
  className = '',
}: {
  items: RatingItem[];
  onSelect?: (kind: RatingKind) => void;
  className?: string;
}) {
  return (
    <div className={`rating-chips${className ? ` ${className}` : ''}`} aria-label="Рейтинги">
      {items.map((item) => {
        const meta = META[item.kind];
        const Icon = meta.Icon;
        const color = item.color || meta.defaultColor;
        const pct = clampPct(item.progress);
        const interactive = Boolean(onSelect);
        const Tag = interactive ? 'button' : 'div';

        return (
          <Tag
            key={item.kind}
            type={interactive ? 'button' : undefined}
            className={`rating-chip${interactive ? ' is-clickable' : ''}`}
            style={{ ['--stat-accent' as string]: color } as CSSProperties}
            title={`${item.label}: ${item.value}${item.hint ? ` · ${item.hint}` : ''} · ${pct}%`}
            aria-label={`${item.label} ${item.value}, прогресс ${pct}%`}
            onClick={interactive ? () => onSelect?.(item.kind) : undefined}
          >
            <ProgressRing progress={pct} color={color} size={26}>
              <Icon size={10} strokeWidth={2.5} />
            </ProgressRing>
            <span className="rating-chip__text">
              <strong>{item.value}</strong>
              <small>{meta.short}</small>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

export function buildRatingItems(opts: {
  level?: number;
  levelTitle?: string;
  levelColor?: string;
  levelPct?: number;
  authority?: number;
  social?: number;
  ecoPoints?: number;
  ecoPct?: number;
}): RatingItem[] {
  const authority = opts.authority ?? 100;
  const social = opts.social ?? 50;
  const ecoPoints = opts.ecoPoints ?? 0;
  const level = opts.level ?? 1;

  return [
    {
      kind: 'LEVEL',
      label: 'Уровень',
      value: `Ур. ${level}`,
      hint: opts.levelTitle || 'прогресс',
      progress: opts.levelPct ?? 0,
      color: opts.levelColor || '#0ea5e9',
    },
    {
      kind: 'AUTHORITY',
      label: 'Авторитет',
      value: `${authority}%`,
      hint: 'посещаемость',
      progress: authority,
      color: '#2563eb',
    },
    {
      kind: 'SOCIAL',
      label: 'Социум',
      value: `${social}%`,
      hint: 'друзья и общение',
      progress: social,
      color: '#7c3aed',
    },
    {
      kind: 'ECO',
      label: 'Эко',
      value: String(ecoPoints),
      hint: 'баллы',
      progress: opts.ecoPct ?? Math.min(100, ecoPoints),
      color: '#059669',
    },
  ];
}
