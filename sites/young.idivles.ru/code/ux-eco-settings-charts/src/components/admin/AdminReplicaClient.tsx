'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import toast from 'react-hot-toast';
import EcoPoolHint from '@/components/EcoPoolHint';

type ReplicaConfig = {
  enabled: boolean;
  role: 'primary' | 'standby' | 'standalone';
  peerHost: string;
  peerSshPort: number;
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
  peerSshPort: 22,
  sharedSecret: '',
  syncIntervalMin: 15,
  syncUploads: true,
  failoverMode: 'manual',
  autoPromote: false,
};

export default function AdminReplicaClient() {
  const [cfg, setCfg] = useState<ReplicaConfig>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/admin/replica', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCfg({ ...empty, ...(d.config || {}) }))
      .catch(() => toast.error('Не удалось загрузить репликацию'));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/replica', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Ошибка сохранения');
      if (d.config) setCfg({ ...empty, ...d.config });
      toast.success('Репликация сохранена');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const field: CSSProperties = {
    display: 'grid',
    gap: 4,
    fontSize: '0.88rem',
  };
  const input: CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    background: '#f8fafc',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.45 }}>
        Синхронизация с резервным VPS (HA). Секрет должен совпадать с{' '}
        <code>/etc/yp-ha.conf</code> на standby. Авто-promote по умолчанию выключен.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
        />
        Включить репликацию
      </label>

      <label style={field}>
        Роль этого узла
        <select
          style={input}
          value={cfg.role}
          onChange={(e) => setCfg({ ...cfg, role: e.target.value as ReplicaConfig['role'] })}
        >
          <option value="standalone">standalone</option>
          <option value="primary">primary</option>
          <option value="standby">standby</option>
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
        <label style={field}>
          Peer host
          <input
            style={input}
            value={cfg.peerHost}
            onChange={(e) => setCfg({ ...cfg, peerHost: e.target.value })}
            placeholder="standby.example.org"
          />
        </label>
        <label style={field}>
          SSH порт
          <input
            style={input}
            type="number"
            min={1}
            max={65535}
            value={cfg.peerSshPort}
            onChange={(e) => setCfg({ ...cfg, peerSshPort: Number(e.target.value) || 22 })}
          />
        </label>
      </div>

      <label style={field}>
        Shared secret
        <input
          style={input}
          value={cfg.sharedSecret}
          onChange={(e) => setCfg({ ...cfg, sharedSecret: e.target.value })}
          placeholder="оставьте •••• чтобы не менять"
          autoComplete="off"
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={field}>
          Интервал синка (мин)
          <input
            style={input}
            type="number"
            min={5}
            max={120}
            value={cfg.syncIntervalMin}
            onChange={(e) => setCfg({ ...cfg, syncIntervalMin: Number(e.target.value) || 15 })}
          />
        </label>
        <label style={field}>
          Failover
          <select
            style={input}
            value={cfg.failoverMode}
            onChange={(e) =>
              setCfg({ ...cfg, failoverMode: e.target.value as ReplicaConfig['failoverMode'] })
            }
          >
            <option value="manual">manual</option>
            <option value="dns-ttl">dns-ttl</option>
            <option value="floating-ip">floating-ip</option>
          </select>
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={cfg.syncUploads}
          onChange={(e) => setCfg({ ...cfg, syncUploads: e.target.checked })}
        />
        Синхронизировать uploads
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309' }}>
        <input
          type="checkbox"
          checked={cfg.autoPromote}
          onChange={(e) => setCfg({ ...cfg, autoPromote: e.target.checked })}
        />
        Авто-promote (опасно)
      </label>

      <label style={field}>
        Заметки
        <textarea
          style={{ ...input, minHeight: 64, resize: 'vertical' }}
          value={cfg.notes || ''}
          onChange={(e) => setCfg({ ...cfg, notes: e.target.value })}
        />
      </label>

      <div style={{ fontSize: '0.8rem', color: '#475569', display: 'grid', gap: 2 }}>
        <div>Последний sync: {cfg.lastSyncAt || '—'}</div>
        <div>Heartbeat: {cfg.lastHeartbeatAt || '—'}</div>
        <div>Статус: {cfg.lastSyncStatus || '—'}</div>
      </div>

      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Сохранение…' : 'Сохранить репликацию'}
      </button>
    </div>
  );
}

export function AdminEcoPoolPanel() {
  const [total, setTotal] = useState(1_000_000);
  const [showInShop, setShowInShop] = useState(true);
  const [showInFooter, setShowInFooter] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [grantCode, setGrantCode] = useState('');
  const [grantAmount, setGrantAmount] = useState(25);
  const [grantReason, setGrantReason] = useState('');

  useEffect(() => {
    void fetch('/api/admin/eco', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.pool) {
          setTotal(d.pool.total);
          setShowInShop(d.pool.showInShop !== false);
          setShowInFooter(Boolean(d.pool.showInFooter));
        }
      })
      .catch(() => undefined);
  }, []);

  const savePool = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/eco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'savePool',
          total,
          showInShop,
          showInFooter,
          notes,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Ошибка');
      toast.success('Пул сохранён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const grant = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/eco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          publicCode: grantCode.trim(),
          amount: grantAmount,
          reason: grantReason.trim() || 'admin_grant',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Ошибка');
      toast.success(`Начислено. Баланс: ${d.ecoPoints}`);
      setGrantCode('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const input: CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    background: '#f8fafc',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EcoPoolHint variant="admin" />

      <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.88rem' }}>
          Размер пула
          <input
            style={input}
            type="number"
            min={1000}
            step={1000}
            value={total}
            onChange={(e) => setTotal(Number(e.target.value) || 1_000_000)}
          />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={showInShop} onChange={(e) => setShowInShop(e.target.checked)} />
          Показывать счётчик в магазине эко-баллов
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showInFooter}
            onChange={(e) => setShowInFooter(e.target.checked)}
          />
          Компактная строка в подвале сайта
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.88rem' }}>
          Заметки
          <textarea
            style={{ ...input, minHeight: 56 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void savePool()}>
          Сохранить пул
        </button>
      </div>

      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: 14,
          display: 'grid',
          gap: 10,
          maxWidth: 480,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Выдать эко-баллы</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          По публичному коду профиля (например YM-NLQX7B). Учитывается остаток пула.
        </p>
        <input
          style={input}
          placeholder="Код пользователя"
          value={grantCode}
          onChange={(e) => setGrantCode(e.target.value)}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
          <input
            style={input}
            type="number"
            min={1}
            max={50000}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value) || 1)}
          />
          <input
            style={input}
            placeholder="Причина (необязательно)"
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !grantCode.trim()}
          onClick={() => void grant()}
        >
          Начислить
        </button>
      </div>
    </div>
  );
}
