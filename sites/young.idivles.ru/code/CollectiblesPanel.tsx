'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Sparkles, PackageOpen, Star } from 'lucide-react';
import toast from 'react-hot-toast';

type Pack = {
  id: 'starter' | 'sochi' | 'keeper';
  label: string;
  cost: number;
  cards: number;
  blurb: string;
  affordable: boolean;
};

type InvCard = {
  id: string;
  title: string;
  series: string;
  rarity: string;
  tagline: string;
  accent: string;
  glyph: string;
  count: number;
  inShowcase: boolean;
  rarityMeta: { label: string; color: string; glow: string };
};

type Drop = {
  id: string;
  title: string;
  rarity: string;
  accent: string;
  glyph: string;
  tagline: string;
  series: string;
};

type LevelInfo = {
  level: { level: number; title: string; blurb: string; color: string; next?: number };
  pct: number;
  contribution: number;
};

export default function CollectiblesPanel({
  onBalanceChange,
}: {
  onBalanceChange?: (eco: number) => void;
}) {
  const [ecoPoints, setEcoPoints] = useState(0);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [inventory, setInventory] = useState<InvCard[]>([]);
  const [showcase, setShowcase] = useState<string[]>([]);
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [uniqueCount, setUniqueCount] = useState(0);
  const [setSize, setSetSize] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [drops, setDrops] = useState<Drop[] | null>(null);

  const load = useCallback(() => {
    fetch('/api/user/collectibles')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.ecoPoints === 'number') {
          setEcoPoints(d.ecoPoints);
          onBalanceChange?.(d.ecoPoints);
        }
        if (Array.isArray(d.packs)) setPacks(d.packs);
        if (Array.isArray(d.inventory)) setInventory(d.inventory);
        if (d.collectibles?.showcase) setShowcase(d.collectibles.showcase);
        if (d.level) setLevel(d.level);
        if (typeof d.uniqueCount === 'number') setUniqueCount(d.uniqueCount);
        if (typeof d.setSize === 'number') setSetSize(d.setSize);
      })
      .catch(() => undefined);
  }, [onBalanceChange]);

  useEffect(() => {
    load();
  }, [load]);

  const openPack = async (packId: string) => {
    setBusy(packId);
    try {
      const res = await fetch('/api/user/collectibles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_pack', packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось открыть пак');
      if (typeof data.ecoPoints === 'number') {
        setEcoPoints(data.ecoPoints);
        onBalanceChange?.(data.ecoPoints);
      }
      setDrops(Array.isArray(data.drops) ? data.drops : []);
      toast.success('Пак открыт!');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  };

  const toggleShowcase = async (id: string) => {
    const next = showcase.includes(id)
      ? showcase.filter((x) => x !== id)
      : [...showcase, id].slice(0, 5);
    setBusy(`show-${id}`);
    try {
      const res = await fetch('/api/user/collectibles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'showcase', showcase: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось');
      setShowcase(next);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  };

  const showcaseCards = useMemo(
    () => showcase.map((id) => inventory.find((c) => c.id === id)).filter(Boolean) as InvCard[],
    [showcase, inventory]
  );

  return (
    <section className="yp-cards" aria-label="Коллекционные карточки">
      <div className="yp-cards__head">
        <h4>
          <Layers size={15} aria-hidden /> Карточки коллекции
        </h4>
        <span className="yp-cards__balance">{ecoPoints} эко</span>
      </div>

      {level ? (
        <div className="yp-cards__level" style={{ ['--lvl' as string]: level.level.color }}>
          <span className="yp-cards__level-badge">
            <Sparkles size={12} aria-hidden /> Ур. {level.level.level} · {level.level.title}
          </span>
          <p>{level.level.blurb}</p>
          {level.level.next ? (
            <div className="yp-cards__level-bar">
              <i style={{ width: `${level.pct}%` }} />
            </div>
          ) : null}
          <small>
            Вклад {level.contribution}
            {level.level.next ? ` · до след. уровня ${level.level.next - level.contribution}` : ' · макс.'}
          </small>
        </div>
      ) : null}

      <p className="yp-cards__lead">
        Собирайте карточки Сочи, афиши и эко-серии. Открывайте паки за эко-баллы и ставьте до 5 карт на
        витрину профиля — как инвентарь в Steam, но под наш портал.
      </p>

      <div className="yp-cards__setline">
        Коллекция: <strong>{uniqueCount}/{setSize}</strong> уникальных
      </div>

      <div className="yp-cards__packs">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`yp-pack yp-pack--${p.id}`}
            disabled={!!busy || ecoPoints < p.cost}
            onClick={() => void openPack(p.id)}
          >
            <PackageOpen size={18} aria-hidden />
            <strong>{p.label}</strong>
            <span>{p.blurb}</span>
            <em>{busy === p.id ? 'Открываем…' : `${p.cost} эко`}</em>
          </button>
        ))}
      </div>

      {drops ? (
        <div className="yp-cards__drops" role="status">
          <div className="yp-cards__drops-head">
            <strong>Дроп</strong>
            <button type="button" onClick={() => setDrops(null)}>
              Закрыть
            </button>
          </div>
          <div className="yp-cards__drops-grid">
            {drops.map((d, i) => (
              <article
                key={`${d.id}-${i}`}
                className={`yp-card yp-card--${d.rarity} is-drop`}
                style={{ ['--card-accent' as string]: d.accent }}
              >
                <span className="yp-card__glyph">{d.glyph}</span>
                <strong>{d.title}</strong>
                <em>{d.series}</em>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {showcaseCards.length > 0 ? (
        <div className="yp-cards__showcase">
          <h5>
            <Star size={13} aria-hidden /> Витрина
          </h5>
          <div className="yp-cards__grid">
            {showcaseCards.map((c) => (
              <article
                key={c.id}
                className={`yp-card yp-card--${c.rarity} is-show`}
                style={{
                  ['--card-accent' as string]: c.accent,
                  ['--card-glow' as string]: c.rarityMeta.glow,
                }}
              >
                <span className="yp-card__rarity">{c.rarityMeta.label}</span>
                <span className="yp-card__glyph">{c.glyph}</span>
                <strong>{c.title}</strong>
                <em>{c.tagline}</em>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <h5 className="yp-cards__inv-title">Инвентарь</h5>
      {inventory.length === 0 ? (
        <p className="yp-cards__empty">Пока пусто — откройте первый пак.</p>
      ) : (
        <div className="yp-cards__grid">
          {inventory.map((c) => (
            <article
              key={c.id}
              className={`yp-card yp-card--${c.rarity}${c.inShowcase ? ' is-show' : ''}`}
              style={{
                ['--card-accent' as string]: c.accent,
                ['--card-glow' as string]: c.rarityMeta.glow,
              }}
            >
              <span className="yp-card__rarity">{c.rarityMeta.label}</span>
              <span className="yp-card__count">×{c.count}</span>
              <span className="yp-card__glyph">{c.glyph}</span>
              <strong>{c.title}</strong>
              <em>{c.series}</em>
              <button
                type="button"
                className="yp-card__pin"
                disabled={busy === `show-${c.id}` || (!c.inShowcase && showcase.length >= 5)}
                onClick={() => void toggleShowcase(c.id)}
              >
                {c.inShowcase ? 'Убрать с витрины' : 'На витрину'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
