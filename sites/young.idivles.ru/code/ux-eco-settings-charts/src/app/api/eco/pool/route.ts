import { NextResponse } from 'next/server';
import { getEcoPoolStats } from '@/lib/eco-pool';

/** Soft public pool counter — no auth required, numbers only. */
export async function GET() {
  try {
    const pool = await getEcoPoolStats();
    if (!pool.showInShop && !pool.showInFooter) {
      return NextResponse.json({
        visible: false,
        total: pool.total,
      });
    }
    return NextResponse.json({
      visible: true,
      total: pool.total,
      held: pool.held,
      spent: pool.spent,
      remaining: pool.remaining,
      issued: pool.issued,
      showInShop: pool.showInShop,
      showInFooter: pool.showInFooter,
    });
  } catch (e) {
    console.error('GET /api/eco/pool', e);
    return NextResponse.json({ visible: false, total: 1_000_000 }, { status: 200 });
  }
}
