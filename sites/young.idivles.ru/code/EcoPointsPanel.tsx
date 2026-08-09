'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Leaf, ShoppingBag, Sparkles, Shirt } from 'lucide-react';
import toast from 'react-hot-toast';
import { ecoTierProgress, ECO_EARN_HINTS, profileLevelProgress } from '@/lib/eco-tier';
import { useVoice } from '@/components/VoiceProvider';
import { SLOT_LABELS, type CosmeticSlot } from '@/lib/eco-loadout';

type CatalogItem = {
  id: string;
  label: string;
  cost: number;
  slot: CosmeticSlot;
  slotLabel?: string;
  owned: boolean;
  equipped?: boolean;
};

type Props = {
  compact?: boolean;
  onBalanceChange?: (ecoPoints: number) => void;
};

export default function EcoPointsPanel({ compact, onBalanceChange }: Props) {
  const [ecoPoints, setEcoPoints] = useState(0);
  const [contribution, setContribution] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { t, setLoadoutLocal, refresh } = useVoice();

  const load = useCallback(() => {
    fetch('/api/user/eco')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.ecoPoints === 'number') {
          setEcoPoints(d.ecoPoints);
          onBalanceChange?.(d.ecoPoints);
        }
        if (typeof d.contribution === 'number') setContribution(d.contribution);
        if (Array.isArray(d.catalog)) setCatalog(d.catalog);
        if (d.loadout && typeof d.loadout === 'object') setLoadoutLocal(d.loadout);
      })
      .catch(() => undefined);
  }, [onBalanceChange, setLoadoutLocal]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    const id = String(body.cosmeticId || body.slot || 'x');
    setBusyId(id);
    try {
      const res = await fetch('/api/user/eco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось');
      if (typeof data.ecoPoints === 'number') {
        setEcoPoints(data.ecoPoints);
        onBalanceChange?.(data.ecoPoints);
      }
      if (data.loadout) setLoadoutLocal(data.loadout);
      load();
      refresh();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  };

  const progress =
    contribution != null ? profileLevelProgress(contribution) : ecoTierProgress(ecoPoints);
  const tierObj = 'level' in progress ? progress.level : progress.tier;
  const pct = progress.pct;
  const tierLabel =
    'title' in tierObj
      ? `Ур. ${tierObj.level} · ${tierObj.title}`
      : tierObj.label;
  const tierColor = tierObj.color;
  const tierNext = tierObj.next;
  const tierBlurb = 'blurb' in tierObj ? tierObj.blurb : '';
  const pointsBase = contribution != null ? contribution : ecoPoints;

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of catalog) {
      const slot = item.slot || 'frame';
      const list = map.get(slot) || [];
      list.push(item);
      map.set(slot, list);
    }
    return Array.from(map.entries());
  }, [catalog]);

  return (
    <section className={`eco-panel${compact ? ' eco-panel--compact' : ''}`} aria-label={t('eco.title', 'Эко-баллы')}>
      <div className="eco-panel__head">
        <h4>
          <Leaf size={15} aria-hidden /> {t('eco.title', 'Эко-баллы')}
        </h4>
        <span className="eco-panel__balance">{ecoPoints}</span>
      </div>

      <div className="eco-panel__tier" style={{ '--eco-tier-color': tierColor } as React.CSSProperties}>
        <span className="eco-panel__tier-badge">
          <Sparkles size={12} aria-hidden />
          {tierLabel}
        </span>
        {tierBlurb ? <p className="eco-panel__level-blurb">{tierBlurb}</p> : null}
        {tierNext ? (
          <div className="eco-panel__tier-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {tierNext ? (
          <span className="eco-panel__tier-next">
            ещё {tierNext - pointsBase} вклада до следующего уровня
          </span>
        ) : (
          <span className="eco-panel__tier-next">Максимальный уровень</span>
        )}
      </div>

      {!compact && (
        <ul className="eco-panel__earn-hints">
          {ECO_EARN_HINTS.map((h) => (
            <li key={h.action}>
              <span>{h.action}</span>
              <strong>+{h.points}</strong>
            </li>
          ))}
        </ul>
      )}

      <p className="eco-panel__lead">{t('eco.spend')}</p>
      {grouped.map(([slot, items]) => (
        <div key={slot} className="eco-panel__slot-group">
          <h5 className="eco-panel__slot-title">
            <Shirt size={13} aria-hidden /> {SLOT_LABELS[slot as CosmeticSlot] || slot}
          </h5>
          <ul className="eco-panel__catalog">
            {items.map((item) => (
              <li
                key={item.id}
                className={`eco-panel__item${item.owned ? ' is-owned' : ''}${item.equipped ? ' is-equipped' : ''}`}
              >
                <div className="eco-panel__item-text">
                  <strong>{item.label}</strong>
                  <span>{item.cost} эко</span>
                </div>
                <div className="eco-panel__item-actions">
                  {!item.owned ? (
                    <button
                      type="button"
                      className="eco-panel__buy"
                      disabled={busyId === item.id || ecoPoints < item.cost}
                      onClick={() => void post({ action: 'buy', cosmeticId: item.id }, t('eco.toast.buy'))}
                    >
                      <ShoppingBag size={13} aria-hidden />
                      {busyId === item.id ? '…' : t('eco.buy', 'Купить')}
                    </button>
                  ) : item.equipped ? (
                    <button
                      type="button"
                      className="eco-panel__buy eco-panel__buy--ghost"
                      disabled={busyId === item.slot}
                      onClick={() =>
                        void post({ action: 'unequip', slot: item.slot }, t('eco.unequip', 'Снято'))
                      }
                    >
                      {t('eco.unequip', 'Снять')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="eco-panel__buy"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void post({ action: 'equip', cosmeticId: item.id }, t('eco.equip', 'Надето'))
                      }
                    >
                      {t('eco.equip', 'Надеть')}
                    </button>
                  )}
                  {item.equipped ? <span className="eco-panel__owned">{t('eco.equipped', 'Надето')}</span> : null}
                  {item.owned && !item.equipped ? (
                    <span className="eco-panel__owned">{t('eco.owned', 'Куплено')}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
