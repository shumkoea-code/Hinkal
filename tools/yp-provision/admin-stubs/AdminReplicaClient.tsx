'use client';

/**
 * STUB UI — Admin → Система → Репликация
 * Drop into src/app/admin/system/replica/page.tsx (or embed in OpsFlagsClient).
 */

import { useEffect, useState } from 'react';

type ReplicaConfig = {
  enabled: boolean;
  role: 'primary' | 'standby' | 'standalone';
  peerHost: string;
  sharedSecret: string;
  syncIntervalMin: number;
  syncUploads: boolean;
  failoverMode: 'manual' | 'dns-ttl' | 'floating-ip';
  autoPromote: boolean;
  lastHeartbeatAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
  notes?: string;
};

const empty: ReplicaConfig = {
  enabled: false,
  role: 'standalone',
  peerHost: '',
  sharedSecret: '',
  syncIntervalMin: 15,
  syncUploads: true,
  failoverMode: 'manual',
  autoPromote: false,
};

export default function AdminReplicaClient() {
  const [cfg, setCfg] = useState<ReplicaConfig>(empty);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/admin/replica', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCfg({ ...empty, ...(d.config || d) }))
      .catch(() => setMsg('Не удалось загрузить'));
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin/replica', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Ошибка сохранения');
      setMsg('Сохранено');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass" style={{ padding: '1.1rem', display: 'grid', gap: 12, maxWidth: 720 }}>
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Репликация / резервный узел</h1>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
        Настройки синхронизации с standby VPS. Секрет должен совпадать с{' '}
        <code>/etc/yp-ha.conf</code> на резерве. Авто-promote по умолчанию выключен.
      </p>

      <label>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
        />{' '}
        Включить репликацию
      </label>

      <label>
        Роль этого узла
        <select
          value={cfg.role}
          onChange={(e) => setCfg({ ...cfg, role: e.target.value as ReplicaConfig['role'] })}
        >
          <option value="standalone">standalone</option>
          <option value="primary">primary</option>
          <option value="standby">standby</option>
        </select>
      </label>

      <label>
        Peer host (standby)
        <input
          value={cfg.peerHost}
          onChange={(e) => setCfg({ ...cfg, peerHost: e.target.value })}
          placeholder="standby.example.org или IP"
        />
      </label>

      <label>
        Shared secret
        <input
          value={cfg.sharedSecret}
          onChange={(e) => setCfg({ ...cfg, sharedSecret: e.target.value })}
          placeholder="длинный случайный секрет"
        />
      </label>

      <label>
        Интервал синка (мин)
        <input
          type="number"
          min={5}
          max={120}
          value={cfg.syncIntervalMin}
          onChange={(e) => setCfg({ ...cfg, syncIntervalMin: Number(e.target.value) || 15 })}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={cfg.syncUploads}
          onChange={(e) => setCfg({ ...cfg, syncUploads: e.target.checked })}
        />{' '}
        Синхронизировать uploads
      </label>

      <label>
        Failover
        <select
          value={cfg.failoverMode}
          onChange={(e) =>
            setCfg({ ...cfg, failoverMode: e.target.value as ReplicaConfig['failoverMode'] })
          }
        >
          <option value="manual">manual (рекомендуется)</option>
          <option value="dns-ttl">dns-ttl + hook</option>
          <option value="floating-ip">floating-ip + hook</option>
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          checked={cfg.autoPromote}
          onChange={(e) => setCfg({ ...cfg, autoPromote: e.target.checked })}
        />{' '}
        Авто-promote при недоступности primary (опасно)
      </label>

      <div style={{ fontSize: '0.82rem', color: '#475569' }}>
        <div>Последний sync: {cfg.lastSyncAt || '—'}</div>
        <div>Heartbeat: {cfg.lastHeartbeatAt || '—'}</div>
        <div>Статус: {cfg.lastSyncStatus || '—'}</div>
      </div>

      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
        Сохранить
      </button>
      {msg ? <div style={{ fontSize: '0.88rem' }}>{msg}</div> : null}
    </div>
  );
}
