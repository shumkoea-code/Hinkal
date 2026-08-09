'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type MetaRow = {
  key: string;
  label: string;
  description: string;
  publicKill: boolean;
  enabled: boolean;
};

type GroupId = 'access' | 'content' | 'community' | 'system';

const GROUP_ORDER: GroupId[] = ['access', 'content', 'community', 'system'];
const GROUP_LABELS: Record<GroupId, string> = {
  access: 'Доступ и вход',
  content: 'Контент и каталоги',
  community: 'Сообщество',
  system: 'Система',
};

function groupFor(key: string): GroupId {
  if (['registration', 'messaging', 'tickets_scan', 'events'].includes(key)) return 'access';
  if (['friends', 'games', 'portfolio'].includes(key)) return 'community';
  if (key === 'maintenance') return 'system';
  return 'content';
}

export default function OpsFlagsClient() {
  const [rows, setRows] = useState<MetaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [eta, setEta] = useState('');
  const [q, setQ] = useState('');
  const [onlyOff, setOnlyOff] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/ops/flags');
    if (res.status === 404) {
      toast.error('Нет доступа');
      return;
    }
    const data = await res.json();
    setRows(Array.isArray(data.meta) ? data.meta : []);
    if (typeof data.maintenanceMessage === 'string') setMsg(data.maintenanceMessage);
    if (typeof data.maintenanceEta === 'string') setEta(data.maintenanceEta);
    else if (data.maintenanceEta == null) setEta('');
    setLoadedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyOff && r.enabled) return false;
      if (!needle) return true;
      return (
        r.key.toLowerCase().includes(needle) ||
        r.label.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, onlyOff]);

  const offCount = rows.filter((r) => !r.enabled).length;
  const publicOff = rows.filter((r) => r.publicKill && !r.enabled).length;

  const saveFlags = async (flags: Record<string, boolean>, extras?: { maintenanceMessage?: string; maintenanceEta?: string }) => {
    setBusy(true);
    try {
      const res = await fetch('/api/ops/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flags,
          maintenanceMessage: extras?.maintenanceMessage ?? msg,
          maintenanceEta: extras?.maintenanceEta ?? eta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Сохранено');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string, enabled: boolean) => {
    const flags: Record<string, boolean> = {};
    for (const r of rows) flags[r.key] = r.key === key ? enabled : r.enabled;
    void saveFlags(flags);
  };

  const bulk = async (allPublic: boolean) => {
    if (!allPublic) {
      const ok = window.confirm(
        'Выключить все публичные модули? Гости и пользователи увидят «Раздел временно отключён». TECH продолжит работать.'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/ops/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allPublic }),
      });
      if (!res.ok) throw new Error('Ошибка');
      toast.success(allPublic ? 'Публичное включено' : 'Публичное выключено');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.35rem', fontWeight: 800, fontSize: '1.5rem' }}>Ops · модули</h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
            Kill-switch разделов сайта. Сессия TECH всегда проходит. Выключение режет UI и API.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: '0.82rem', color: 'var(--muted)' }}>
          <span>
            Выкл: <strong style={{ color: offCount ? '#b45309' : 'inherit' }}>{offCount}</strong>
            {publicOff ? ` · публичных ${publicOff}` : ''}
          </span>
          {loadedAt ? <span>Обновлено {loadedAt}</span> : null}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()} style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
            Обновить
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void bulk(false)}>
          Выключить всё публичное
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void bulk(true)}>
          Включить всё публичное
        </button>
        <a href="/dashboard" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Кабинет
        </a>
        <a href="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          На сайт
        </a>
      </div>

      <div
        className="card-surface"
        style={{
          padding: '1rem',
          marginBottom: '1rem',
          display: 'grid',
          gap: 10,
          gridTemplateColumns: '1fr',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск модуля…"
            aria-label="Поиск модуля"
            style={{ flex: '1 1 220px', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyOff} onChange={(e) => setOnlyOff(e.target.checked)} />
            Только выключенные
          </label>
        </div>

        <strong>Сообщение техработ</strong>
        <textarea
          rows={2}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Текст на /maintenance"
          style={{ width: '100%', padding: 8, borderRadius: 8 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            placeholder="ETA, например «около 18:00» (не число минут)"
            style={{ flex: '1 1 220px', padding: 8, borderRadius: 8 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setEta('');
              const flags: Record<string, boolean> = {};
              for (const r of rows) flags[r.key] = r.enabled;
              void saveFlags(flags, { maintenanceEta: '' });
            }}
          >
            Очистить ETA
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              const flags: Record<string, boolean> = {};
              for (const r of rows) flags[r.key] = r.enabled;
              void saveFlags(flags);
            }}
          >
            Сохранить текст / ETA
          </button>
        </div>
      </div>

      {GROUP_ORDER.map((gid) => {
        const groupRows = filtered.filter((r) => groupFor(r.key) === gid);
        if (!groupRows.length) return null;
        return (
          <section key={gid} style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 0.55rem' }}>
              {GROUP_LABELS[gid]}
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {groupRows.map((r) => (
                <li
                  key={r.key}
                  className="card-surface"
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    opacity: r.enabled ? 1 : 0.82,
                    borderLeft: r.enabled ? '3px solid #16a34a' : '3px solid #d97706',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <strong>{r.label}</strong>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: 999,
                          background: r.enabled ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.14)',
                          color: r.enabled ? '#15803d' : '#b45309',
                        }}
                      >
                        {r.enabled ? 'Включено' : 'Выключено'}
                      </span>
                      {!r.publicKill ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>системный</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
                      <code style={{ fontSize: '0.78rem' }}>{r.key}</code> · {r.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.enabled}
                    className={r.enabled ? 'btn btn-primary' : 'btn btn-secondary'}
                    disabled={busy}
                    onClick={() => toggle(r.key, !r.enabled)}
                    style={{ minWidth: 88, flexShrink: 0 }}
                  >
                    {r.enabled ? 'Выкл' : 'Вкл'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!filtered.length ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>Ничего не найдено</p>
      ) : null}
    </div>
  );
}
