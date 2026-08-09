/**
 * Global eco-points pool (1_000_000 default).
 * Issued = sum of positive ECO reputation deltas.
 * Held = sum of current user balances.
 * Spent = issued − held (shop purchases etc.).
 * Remaining = total − issued.
 */
import { prisma } from '@/lib/prisma';
import { ECO } from '@/lib/eco-points';

export type EcoPoolConfig = {
  total: number;
  /** Soft counter in shop / profile (default on) */
  showInShop: boolean;
  /** Tiny footer hint (default off — less noisy) */
  showInFooter: boolean;
  /** Admin dashboard always can see via API */
  notes?: string;
};

export type EcoPoolStats = {
  total: number;
  issued: number;
  held: number;
  spent: number;
  remaining: number;
  showInShop: boolean;
  showInFooter: boolean;
};

export const ECO_POOL_DEFAULTS: EcoPoolConfig = {
  total: ECO.MAX,
  showInShop: true,
  showInFooter: false,
  notes: '',
};

export function parseEcoPoolJson(raw: unknown): EcoPoolConfig {
  const base = { ...ECO_POOL_DEFAULTS };
  if (!raw) return base;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return base;
    const total = Number((data as EcoPoolConfig).total);
    if (Number.isFinite(total) && total >= 1000) {
      base.total = Math.min(100_000_000, Math.floor(total));
    }
    if (typeof (data as EcoPoolConfig).showInShop === 'boolean') {
      base.showInShop = (data as EcoPoolConfig).showInShop;
    }
    if (typeof (data as EcoPoolConfig).showInFooter === 'boolean') {
      base.showInFooter = (data as EcoPoolConfig).showInFooter;
    }
    if (typeof (data as EcoPoolConfig).notes === 'string') {
      base.notes = String((data as EcoPoolConfig).notes || '').slice(0, 500);
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export function serializeEcoPoolJson(cfg: EcoPoolConfig): string {
  return JSON.stringify({
    total: cfg.total,
    showInShop: cfg.showInShop,
    showInFooter: cfg.showInFooter,
    notes: cfg.notes || '',
  });
}

export async function getEcoPoolStats(): Promise<EcoPoolStats> {
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } }).catch(() => null);
  const cfg = parseEcoPoolJson(
    (settings as { ecoPoolJson?: string | null } | null)?.ecoPoolJson
  );

  const [agg, heldAgg] = await Promise.all([
    prisma.reputationEvent.groupBy({
      by: ['kind'],
      where: { kind: 'ECO' },
      _sum: { delta: true },
    }).catch(() => [] as { kind: string; _sum: { delta: number | null } }[]),
    prisma.user.aggregate({
      _sum: { ecoPoints: true },
      where: { deletedAt: null },
    }).catch(() => ({ _sum: { ecoPoints: null as number | null } })),
  ]);

  // Net sum of all ECO deltas ≈ held (if history complete). Prefer held from users.
  const held = Math.max(0, heldAgg._sum.ecoPoints ?? 0);

  // Issued ≈ sum of positive deltas; spent ≈ abs(sum of negative)
  let issuedPos = 0;
  let spentAbs = 0;
  try {
    const [pos, neg] = await Promise.all([
      prisma.reputationEvent.aggregate({
        where: { kind: 'ECO', delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      prisma.reputationEvent.aggregate({
        where: { kind: 'ECO', delta: { lt: 0 } },
        _sum: { delta: true },
      }),
    ]);
    issuedPos = Math.max(0, pos._sum.delta ?? 0);
    spentAbs = Math.max(0, -(neg._sum.delta ?? 0));
  } catch {
    // Fallback: treat current held as issued if history missing
    issuedPos = held;
    spentAbs = 0;
    void agg;
  }

  // If history under-counts (legacy balances without events), lift issued to held+spent
  const issued = Math.max(issuedPos, held + spentAbs);
  const spent = Math.max(spentAbs, Math.max(0, issued - held));
  const remaining = Math.max(0, cfg.total - issued);

  return {
    total: cfg.total,
    issued,
    held,
    spent,
    remaining,
    showInShop: cfg.showInShop,
    showInFooter: cfg.showInFooter,
  };
}

/** How many points can still be granted from the pool. */
export async function ecoPoolRemaining(): Promise<number> {
  const s = await getEcoPoolStats();
  return s.remaining;
}
