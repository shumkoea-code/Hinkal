'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  Compass,
  Copy,
  Crown,
  Eye,
  Flame,
  Gamepad2,
  Gauge,
  Handshake,
  Heart,
  Leaf,
  MapPin,
  Medal,
  MessageCircle,
  Puzzle,
  QrCode,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Ticket,
  User,
  Users,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useVoiceCopy } from '@/components/VoiceProvider';
import {
  ACHIEVEMENTS,
  TIER_META,
  type AchievementDef,
} from '@/lib/achievements';
import { RatingProgressChips, buildRatingItems } from '@/components/RatingProgressIcons';
import {
  SHOWCASE_MAX,
  parseShowcaseBadges,
  resolveShowcaseCodes,
  type UnlockedShowcase,
} from '@/lib/showcase-badges';

const ICONS = {
  Sparkles,
  Ticket,
  QrCode,
  Shield,
  Users,
  Flame,
  Star,
  Heart,
  MapPin,
  Award,
  Zap,
  Crown,
  MessageCircle,
  Camera,
  Compass,
  CalendarCheck,
  Building2,
  Medal,
  Rocket,
  Eye,
  Gamepad2,
  Puzzle,
  Target,
  BookOpen,
  BadgeCheck,
  Briefcase,
  Leaf,
  Handshake,
} as const;

type AchItem = AchievementDef & {
  unlocked?: boolean;
  unlockedAt?: string | null;
};

export type ProfileStatKey = 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO';

type Props = {
  name: string | null | undefined;
  nickname?: string | null;
  image?: string | null;
  publicCode?: string | null;
  bio?: string | null;
  legend?: boolean;
  showcaseStored?: string | null | string[];
  instructionsVersion?: string | null;
  instructionsCompletedAt?: string | null;
  authority?: number;
  social?: number;
  ecoPoints?: number;
  onEditBio?: () => void;
  onShowcaseSaved?: (codes: string[]) => void;
  onStatClick?: (key: ProfileStatKey) => void;
};

function BadgeIcon({ def, size = 12 }: { def: AchievementDef; size?: number }) {
  const Icon = ICONS[def.icon] || Award;
  return <Icon size={size} strokeWidth={2.4} />;
}

export default function ProfileHeroCard({
  name,
  nickname,
  image,
  publicCode,
  bio,
  legend,
  showcaseStored,
  instructionsVersion,
  instructionsCompletedAt,
  authority = 100,
  social = 50,
  ecoPoints = 0,
  onEditBio,
  onShowcaseSaved,
  onStatClick,
}: Props) {
  const emptyAch = useVoiceCopy('profile.empty.achievements', 'Пока нет открытых достижений');
  const [items, setItems] = useState<AchItem[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [levelLabel, setLevelLabel] = useState('1');
  const [levelColor, setLevelColor] = useState('#94a3b8');
  const [levelBlurb, setLevelBlurb] = useState('Новичок');
  const [levelPct, setLevelPct] = useState(0);
  const [levelNum, setLevelNum] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/achievements')
      .then(async (r) => {
        const raw = await r.text();
        try {
          return JSON.parse(raw) as { items?: AchItem[] };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data?.items)) return;
        const unlocked = (data.items as AchItem[]).filter((i) => i.unlocked);
        setItems(unlocked);
        const unlockedMeta: UnlockedShowcase[] = unlocked.map((i) => ({
          code: i.code,
          unlockedAt: i.unlockedAt || null,
        }));
        const stored = parseShowcaseBadges(showcaseStored);
        setCodes(resolveShowcaseCodes(stored, unlockedMeta));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showcaseStored, instructionsVersion, instructionsCompletedAt]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/eco', { cache: 'no-store' })
      .then(async (r) => {
        const raw = await r.text();
        try {
          return JSON.parse(raw) as {
            level?: { level?: { level?: number; color?: string; title?: string }; pct?: number };
          };
        } catch {
          return null;
        }
      })
      .then((d) => {
        if (cancelled || !d?.level?.level) return;
        const lvl = d.level.level;
        setLevelLabel(String(lvl.level || 1));
        setLevelNum(lvl.level || 1);
        setLevelColor(lvl.color || '#94a3b8');
        setLevelBlurb(lvl.title || '');
        setLevelPct(typeof d.level.pct === 'number' ? d.level.pct : 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ecoPoints]);

  const unlockedMeta = useMemo<UnlockedShowcase[]>(
    () => items.map((i) => ({ code: i.code, unlockedAt: i.unlockedAt || null })),
    [items]
  );

  const defs = useMemo(
    () =>
      codes
        .map((c) => items.find((i) => i.code === c) || ACHIEVEMENTS.find((a) => a.code === c))
        .filter(Boolean) as AchievementDef[],
    [codes, items]
  );

  const save = async (next: string[]) => {
    const cleaned = Array.from(new Set(next.filter((c) => unlockedMeta.some((u) => u.code === c)))).slice(
      0,
      SHOWCASE_MAX
    );
    const toStore = cleaned.length ? cleaned : resolveShowcaseCodes([], unlockedMeta);
    setCodes(toStore);
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showcaseBadges: cleaned }),
      });
      const raw = await res.text();
      let data: { message?: string } | null = null;
      try {
        data = raw ? (JSON.parse(raw) as { message?: string }) : null;
      } catch {
        data = null;
      }
      if (!res.ok) throw new Error(data?.message || 'fail');
      onShowcaseSaved?.(cleaned.length ? cleaned : toStore);
      toast.success('Значки сохранены');
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'fail' ? e.message : 'Не удалось сохранить значки');
    } finally {
      setSaving(false);
    }
  };

  const toggleCode = (code: string) => {
    const on = codes.includes(code);
    if (on) {
      void save(codes.filter((c) => c !== code));
      return;
    }
    if (codes.length >= SHOWCASE_MAX) {
      toast.error(`Можно выбрать не больше ${SHOWCASE_MAX}`);
      return;
    }
    void save([...codes, code]);
  };

  const displayName = nickname || name || 'Профиль';
  const avatarStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
  };

  const ratingItems = buildRatingItems({
    level: levelNum,
    levelTitle: levelBlurb,
    levelColor,
    levelPct,
    authority,
    social,
    ecoPoints,
    ecoPct: levelPct,
  }).map((item) =>
    item.kind === 'LEVEL'
      ? { ...item, value: String(levelNum || levelLabel || 1), hint: levelBlurb || item.hint }
      : item.kind === 'ECO'
        ? { ...item, hint: 'магазин и история' }
        : item
  );

  return (
    <div className={`profile-hero${legend ? ' is-legend' : ''}`}>
      <div className="profile-hero__main">
        <div className="profile-hero__avatar-col">
          <div className={`profile-hero__avatar${legend ? ' avatar-legend-frame' : ''}`}>
            <div className={legend ? 'avatar-legend-inner' : 'profile-hero__avatar-inner'}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" style={avatarStyle} />
              ) : (
                <span className="profile-hero__avatar-fallback">
                  {(name || '?').charAt(0).toUpperCase() || <User size={22} />}
                </span>
              )}
            </div>
          </div>
          {defs.length > 0 ? (
            <div className="profile-hero__pins" aria-label="Значки под аватаром">
              {defs.map((def, i) => (
                <span
                  key={`${def.code}-${i}`}
                  className="profile-hero__pin"
                  title={def.title}
                  style={{
                    background: `linear-gradient(145deg, ${def.accent}, color-mix(in srgb, ${def.accent} 55%, #0f172a))`,
                  }}
                >
                  <BadgeIcon def={def} size={11} />
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="profile-hero__meta">
          <div className="profile-hero__name">{displayName}</div>
          {nickname && name && nickname !== name ? (
            <div className="profile-hero__sub">{name}</div>
          ) : null}
          {publicCode ? (
            <button
              type="button"
              className="profile-hero__id"
              title="Скопировать публичный ID"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicCode);
                  toast.success('ID скопирован');
                } catch {
                  toast.error('Не удалось скопировать');
                }
              }}
            >
              ID {publicCode} <Copy size={11} />
            </button>
          ) : null}
          {bio ? (
            <p className="profile-hero__bio">{bio}</p>
          ) : onEditBio ? (
            <button type="button" className="profile-hero__bio-cta" onClick={onEditBio}>
              Добавь вайб — кто ты сегодня →
            </button>
          ) : null}
        </div>
      </div>

      <div className="profile-hero__stats" aria-label="Рейтинги и уровень">
        <RatingProgressChips items={ratingItems} onSelect={(key) => onStatClick?.(key)} />
      </div>

      <div className="profile-hero__showcase">
        <div className="profile-hero__showcase-head">
          <div className="profile-hero__showcase-label">
            Значки под аватаром
            <span>{saving ? 'сохраняю…' : `${codes.length}/${SHOWCASE_MAX}`}</span>
          </div>
          <button
            type="button"
            className={`profile-hero__edit-btn${editing ? ' is-on' : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={!items.length && !editing}
          >
            {editing ? 'Готово' : 'Выбрать'}
          </button>
        </div>

        {!editing && defs.length > 0 ? (
          <div className="profile-hero__selected" aria-label="Выбранные значки">
            {defs.map((def) => (
              <span
                key={def.code}
                className="profile-hero__chip"
                style={{
                  borderColor: `color-mix(in srgb, ${def.accent} 40%, transparent)`,
                  background: `color-mix(in srgb, ${def.accent} 12%, #fff)`,
                  color: def.accent,
                }}
              >
                <BadgeIcon def={def} size={13} />
                {def.title}
              </span>
            ))}
          </div>
        ) : null}

        {!editing && !defs.length ? (
          <p className="profile-hero__hint">
            {items.length
              ? 'Пока ничего не выбрано — нажмите «Выбрать».'
              : 'Откройте достижения, чтобы украсить профиль.'}
          </p>
        ) : null}

        {editing ? (
          <div className="profile-hero__grid" role="listbox" aria-multiselectable="true">
            <p className="profile-hero__hint">
              Нажмите на значок, чтобы добавить или убрать. Максимум {SHOWCASE_MAX}.
            </p>
            {items.map((item) => {
              const active = codes.includes(item.code);
              const blocked = !active && codes.length >= SHOWCASE_MAX;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={blocked && !active}
                  className={`profile-hero__option${active ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
                  onClick={() => toggleCode(item.code)}
                >
                  <span className="profile-hero__option-icon" style={{ background: item.accent }}>
                    <BadgeIcon def={item} size={14} />
                  </span>
                  <span className="profile-hero__option-text">
                    <strong>{item.title}</strong>
                    <small>{TIER_META[item.tier].label}</small>
                  </span>
                  <span className={`profile-hero__option-check${active ? ' is-on' : ''}`} aria-hidden>
                    {active ? <Check size={14} strokeWidth={2.6} /> : null}
                  </span>
                </button>
              );
            })}
            {!items.length ? <div className="profile-hero__pick-empty">{emptyAch}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
