'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  ACTION_LABELS_RU,
  CATEGORY_LABELS_RU,
  type UserActionCategory,
} from '@/lib/user-action-log-shared';

type Row = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userCode: string | null;
  action: string;
  category: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  detail: string | null;
  success: boolean;
  path: string | null;
  ip: string | null;
  createdAt: string;
};

type Payload = {
  total: number;
  page: number;
  take: number;
  totalPages: number;
  items: Row[];
  stats: { byCategory: { category: string; count: number; label: string }[] };
};

const CATS = Object.keys(CATEGORY_LABELS_RU) as UserActionCategory[];

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AdminActivityClient({
  initialCategory = '',
}: {
  initialCategory?: string;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set('q', q.trim());
      if (category) sp.set('category', category);
      sp.set('page', String(page));
      sp.set('take', '40');
      const res = await fetch(`/api/admin/activity?${sp}`, { cache: 'no-store' });
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as Payload & { message?: string }) : null;
      if (!res.ok || !json) throw new Error(json?.message || 'Ошибка загрузки');
      setData(json);
    } catch (e) {
      setData(null);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [q, category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="activity-page admin-page-shell">
      <div className="activity-page__head">
        <div>
          <h1>
            <Activity size={22} aria-hidden /> Активность пользователей
          </h1>
          <p>
            Журнал действий на портале (профиль, брони, заявки, безопасность, боты). Секреты не
            сохраняются. Журнал админов — отдельно в{' '}
            <Link href="/admin/audit-log">Журнал админов</Link>.
          </p>
        </div>
        <button type="button" className="bots-btn bots-btn--ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'bots-spin' : undefined} /> Обновить
        </button>
      </div>

      {data?.stats?.byCategory?.length ? (
        <div className="activity-stats">
          {data.stats.byCategory.slice(0, 8).map((s) => (
            <button
              key={s.category}
              type="button"
              className={`activity-stat${category === s.category ? ' is-on' : ''}`}
              onClick={() => {
                setCategory(category === s.category ? '' : s.category);
                setPage(1);
              }}
            >
              <strong>{s.count}</strong>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="activity-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load();
        }}
      >
        <div className="activity-filters__search">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="email, код YM-…, действие, IP"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Все категории</option>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS_RU[c]}
            </option>
          ))}
        </select>
        <button type="submit" className="bots-btn bots-btn--primary">
          Найти
        </button>
      </form>

      <div className="activity-meta">
        {loading ? (
          <span>
            <Loader2 size={14} className="bots-spin" /> Загрузка…
          </span>
        ) : (
          <span>Записей: {data?.total ?? 0}</span>
        )}
      </div>

      <div className="activity-list">
        {(data?.items || []).map((row) => {
          const open = expanded === row.id;
          let detailObj: unknown = null;
          if (row.detail) {
            try {
              detailObj = JSON.parse(row.detail);
            } catch {
              detailObj = row.detail;
            }
          }
          return (
            <button
              key={row.id}
              type="button"
              className={`activity-row${row.success ? '' : ' is-fail'}${open ? ' is-open' : ''}`}
              onClick={() => setExpanded(open ? null : row.id)}
            >
              <div className="activity-row__top">
                <time>{fmt(row.createdAt)}</time>
                <span className="activity-row__cat">
                  {CATEGORY_LABELS_RU[row.category as UserActionCategory] || row.category}
                </span>
                <strong>{row.summary || ACTION_LABELS_RU[row.action] || row.action}</strong>
              </div>
              <div className="activity-row__who">
                {row.userCode ? <code>{row.userCode}</code> : null}
                <span>{row.userEmail || row.userId || 'гость / система'}</span>
                {row.ip ? <small>IP {row.ip}</small> : null}
              </div>
              {open ? (
                <div className="activity-row__detail">
                  <div>
                    Действие: <code>{row.action}</code>
                    {row.targetType ? (
                      <>
                        {' '}
                        · цель: {row.targetType}
                        {row.targetId ? ` / ${row.targetId}` : ''}
                      </>
                    ) : null}
                  </div>
                  {row.path ? <div>Путь: {row.path}</div> : null}
                  {detailObj ? (
                    <pre>{typeof detailObj === 'string' ? detailObj : JSON.stringify(detailObj, null, 2)}</pre>
                  ) : null}
                  {row.userId ? (
                    <Link href={`/admin/users?q=${encodeURIComponent(row.userEmail || row.userId)}`}>
                      Пользователь в админке →
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
        {!loading && !(data?.items || []).length ? (
          <p className="bots-muted">Пока нет записей — действия появятся после активности пользователей.</p>
        ) : null}
      </div>

      {data && data.totalPages > 1 ? (
        <div className="activity-pager">
          <button
            type="button"
            className="bots-btn bots-btn--ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </button>
          <span>
            {page} / {data.totalPages}
          </span>
          <button
            type="button"
            className="bots-btn bots-btn--ghost"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </button>
        </div>
      ) : null}
    </div>
  );
}
