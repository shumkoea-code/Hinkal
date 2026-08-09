import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import {
  parseReplicaJson,
  serializeReplicaJson,
  publicReplicaStatus,
  type ReplicaConfig,
} from '@/lib/replica-config';

export async function GET() {
  try {
    await requireAdmin();
    const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
    const cfg = parseReplicaJson((settings as { replicaJson?: string | null } | null)?.replicaJson);
    return NextResponse.json({
      config: { ...cfg, sharedSecret: cfg.sharedSecret ? '••••••••' : '' },
      hasSecret: Boolean(cfg.sharedSecret),
      status: publicReplicaStatus(cfg),
    });
  } catch (e) {
    return aclJsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
    const prev = parseReplicaJson((settings as { replicaJson?: string | null } | null)?.replicaJson);

    const next: ReplicaConfig = {
      ...prev,
      enabled: Boolean(body.enabled),
      role:
        body.role === 'primary' || body.role === 'standby' || body.role === 'standalone'
          ? body.role
          : prev.role,
      peerHost: String(body.peerHost || '').trim().slice(0, 200),
      peerSshPort: Math.max(1, Math.min(65535, Number(body.peerSshPort) || prev.peerSshPort || 22)),
      syncIntervalMin: Math.max(5, Math.min(120, Number(body.syncIntervalMin) || 15)),
      syncUploads: body.syncUploads !== false,
      failoverMode:
        body.failoverMode === 'dns-ttl' || body.failoverMode === 'floating-ip'
          ? body.failoverMode
          : 'manual',
      autoPromote: Boolean(body.autoPromote),
      notes: String(body.notes || '').slice(0, 800),
      lastHeartbeatAt: prev.lastHeartbeatAt,
      lastSyncAt: prev.lastSyncAt,
      lastSyncStatus: prev.lastSyncStatus,
      sharedSecret: prev.sharedSecret,
    };

    const secretRaw = String(body.sharedSecret || '').trim();
    if (secretRaw && secretRaw !== '••••••••') {
      next.sharedSecret = secretRaw.slice(0, 256);
    }

    await prisma.siteSettings.upsert({
      where: { id: '1' },
      update: { replicaJson: serializeReplicaJson(next) } as Record<string, unknown>,
      create: { id: '1', replicaJson: serializeReplicaJson(next) } as Record<string, unknown>,
    });

    return NextResponse.json({
      ok: true,
      message: 'Сохранено',
      config: { ...next, sharedSecret: next.sharedSecret ? '••••••••' : '' },
    });
  } catch (e) {
    return aclJsonError(e);
  }
}
