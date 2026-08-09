/**
 * STUB — POST /api/admin/replica/heartbeat
 * Auth: Authorization: Bearer <sharedSecret>
 * Body: { role, host, syncedAt, status? }
 *
 * Stores lastHeartbeatAt into SiteSettings.replicaJson / ReplicaMeta.
 * ADMIN-only read via GET /api/admin/replica.
 */

/*
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getReplicaConfig, saveReplicaConfig } from '@/lib/replica';

export async function POST(req: NextRequest) {
  const cfg = await getReplicaConfig();
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!cfg.enabled || !cfg.sharedSecret || token !== cfg.sharedSecret) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  await saveReplicaConfig({
    ...cfg,
    lastHeartbeatAt: new Date().toISOString(),
    lastSyncAt: body.syncedAt || cfg.lastSyncAt,
    lastSyncStatus: body.status === 'error' ? 'error' : 'ok',
  });
  return NextResponse.json({ ok: true });
}
*/
export {};
