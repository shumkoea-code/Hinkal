/**
 * Admin stubs for replica / HA settings.
 * Target paths on portal:
 *  - src/app/admin/system/replica/page.tsx
 *  - src/app/api/admin/replica/route.ts
 *  - src/app/api/admin/replica/heartbeat/route.ts
 *  - prisma: ReplicaMeta model (or key/value SiteSettings JSON)
 *
 * Wire into AdminSidebar under «Система» → «Репликация».
 */

export type ReplicaConfig = {
  enabled: boolean;
  role: 'primary' | 'standby' | 'standalone';
  peerHost: string; // standby hostname or IP
  peerSshPort?: number;
  sharedSecret: string; // Bearer for heartbeat + admin API
  syncIntervalMin: number; // 5–60
  syncUploads: boolean;
  failoverMode: 'manual' | 'dns-ttl' | 'floating-ip';
  autoPromote: boolean; // dangerous — default false
  lastHeartbeatAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: 'ok' | 'error' | 'unknown';
  notes?: string;
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

/** Suggested SiteSettings field: replicaJson Text */
