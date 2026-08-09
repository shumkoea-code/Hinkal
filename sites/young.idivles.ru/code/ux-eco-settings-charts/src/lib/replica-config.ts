/**
 * Replica / HA config stored in SiteSettings.replicaJson
 */
export type ReplicaConfig = {
  enabled: boolean;
  role: 'primary' | 'standby' | 'standalone';
  peerHost: string;
  peerSshPort: number;
  sharedSecret: string;
  syncIntervalMin: number;
  syncUploads: boolean;
  failoverMode: 'manual' | 'dns-ttl' | 'floating-ip';
  autoPromote: boolean;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'ok' | 'error' | 'unknown';
  notes: string;
};

export const REPLICA_DEFAULTS: ReplicaConfig = {
  enabled: false,
  role: 'standalone',
  peerHost: '',
  peerSshPort: 22,
  sharedSecret: '',
  syncIntervalMin: 15,
  syncUploads: true,
  failoverMode: 'manual',
  autoPromote: false,
  lastHeartbeatAt: null,
  lastSyncAt: null,
  lastSyncStatus: 'unknown',
  notes: '',
};

export function parseReplicaJson(raw: unknown): ReplicaConfig {
  const base: ReplicaConfig = { ...REPLICA_DEFAULTS };
  if (!raw) return base;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return base;
    const d = data as Partial<ReplicaConfig>;
    if (typeof d.enabled === 'boolean') base.enabled = d.enabled;
    if (d.role === 'primary' || d.role === 'standby' || d.role === 'standalone') base.role = d.role;
    if (typeof d.peerHost === 'string') base.peerHost = d.peerHost.slice(0, 200);
    const port = Number(d.peerSshPort);
    if (Number.isFinite(port) && port > 0 && port < 65536) base.peerSshPort = Math.floor(port);
    if (typeof d.sharedSecret === 'string') base.sharedSecret = d.sharedSecret.slice(0, 256);
    const iv = Number(d.syncIntervalMin);
    if (Number.isFinite(iv)) base.syncIntervalMin = Math.max(5, Math.min(120, Math.floor(iv)));
    if (typeof d.syncUploads === 'boolean') base.syncUploads = d.syncUploads;
    if (d.failoverMode === 'manual' || d.failoverMode === 'dns-ttl' || d.failoverMode === 'floating-ip') {
      base.failoverMode = d.failoverMode;
    }
    if (typeof d.autoPromote === 'boolean') base.autoPromote = d.autoPromote;
    if (d.lastHeartbeatAt === null || typeof d.lastHeartbeatAt === 'string') {
      base.lastHeartbeatAt = d.lastHeartbeatAt ?? null;
    }
    if (d.lastSyncAt === null || typeof d.lastSyncAt === 'string') {
      base.lastSyncAt = d.lastSyncAt ?? null;
    }
    if (d.lastSyncStatus === 'ok' || d.lastSyncStatus === 'error' || d.lastSyncStatus === 'unknown') {
      base.lastSyncStatus = d.lastSyncStatus;
    }
    if (typeof d.notes === 'string') base.notes = d.notes.slice(0, 800);
  } catch {
    /* defaults */
  }
  return base;
}

export function serializeReplicaJson(cfg: ReplicaConfig): string {
  return JSON.stringify({
    enabled: cfg.enabled,
    role: cfg.role,
    peerHost: cfg.peerHost,
    peerSshPort: cfg.peerSshPort,
    sharedSecret: cfg.sharedSecret,
    syncIntervalMin: cfg.syncIntervalMin,
    syncUploads: cfg.syncUploads,
    failoverMode: cfg.failoverMode,
    autoPromote: cfg.autoPromote,
    lastHeartbeatAt: cfg.lastHeartbeatAt,
    lastSyncAt: cfg.lastSyncAt,
    lastSyncStatus: cfg.lastSyncStatus,
    notes: cfg.notes,
  });
}

/** Public-safe view (no secret). */
export function publicReplicaStatus(cfg: ReplicaConfig) {
  return {
    enabled: cfg.enabled,
    role: cfg.role,
    peerHost: cfg.peerHost ? '••••' : '',
    syncIntervalMin: cfg.syncIntervalMin,
    syncUploads: cfg.syncUploads,
    failoverMode: cfg.failoverMode,
    autoPromote: cfg.autoPromote,
    lastHeartbeatAt: cfg.lastHeartbeatAt,
    lastSyncAt: cfg.lastSyncAt,
    lastSyncStatus: cfg.lastSyncStatus,
    notes: cfg.notes,
  };
}
