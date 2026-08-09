'use client';

/**
 * Soft eco-pool counter — compact, non-intrusive.
 */
import { useEffect, useState } from 'react';
import { Leaf } from 'lucide-react';

type Pool = {
  visible: boolean;
  total: number;
  held?: number;
  spent?: number;
  remaining?: number;
  showInShop?: boolean;
  showInFooter?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export default function EcoPoolHint({
  variant = 'shop',
}: {
  variant?: 'shop' | 'footer' | 'admin';
}) {
  const [pool, setPool] = useState<Pool | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = variant === 'admin' ? '/api/admin/eco' : '/api/eco/pool';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (variant === 'admin' && d.pool) {
          setPool({ visible: true, ...d.pool });
        } else {
          setPool(d as Pool);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [variant]);

  if (!pool?.visible && variant !== 'admin') return null;
  if (variant === 'footer' && pool && pool.showInFooter === false) return null;
  if (variant === 'shop' && pool && pool.showInShop === false) return null;
  if (!pool || typeof pool.total !== 'number') return null;

  const held = pool.held ?? 0;
  const spent = pool.spent ?? 0;
  const remaining = pool.remaining ?? Math.max(0, pool.total - held - spent);
  const issued = held + spent;
  const pct = pool.total > 0 ? Math.min(100, Math.round((issued / pool.total) * 100)) : 0;

  if (variant === 'footer') {
    return (
      <p className="eco-pool-hint eco-pool-hint--footer" title="Общий пул эко-баллов портала">
        <Leaf size={12} aria-hidden /> Эко-пул: осталось {fmt(remaining)} из {fmt(pool.total)}
      </p>
    );
  }

  return (
    <div
      className={`eco-pool-hint eco-pool-hint--${variant}`}
      aria-label="Пул эко-баллов"
    >
      <div className="eco-pool-hint__head">
        <Leaf size={14} aria-hidden />
        <span>Пул эко-баллов</span>
        <strong>{fmt(remaining)}</strong>
        <span className="eco-pool-hint__muted">осталось</span>
      </div>
      <div className="eco-pool-hint__bar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="eco-pool-hint__meta">
        <span>всего {fmt(pool.total)}</span>
        <span>у участников {fmt(held)}</span>
        <span>потрачено {fmt(spent)}</span>
      </div>
    </div>
  );
}
