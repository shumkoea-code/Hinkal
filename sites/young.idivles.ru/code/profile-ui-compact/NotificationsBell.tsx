'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, BellOff, X } from 'lucide-react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  disableWebPush,
  enableWebPush,
  getPushStatus,
  pushSupported,
} from '@/lib/client-push';
import {
  NOTIFICATION_TYPE_OPTIONS,
  notificationActorLine,
  notificationTypeLabel,
  parseNotificationMeta,
  resolveNotificationHref,
  type NotificationTypeId,
} from '@/lib/notification-meta';

type Item = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  meta?: string | null;
};

type PanelPos = { top: number; left: number; width: number; maxHeight: number };

type FilterId = 'all' | 'unread' | NotificationTypeId;

const TYPE_OPTIONS = NOTIFICATION_TYPE_OPTIONS;

export default function NotificationsBell({ compact = false, useNavStyle = false }: { compact?: boolean; useNavStyle?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  /** Inbox scope: all vs unread vs handled decisions */
  const [scope, setScope] = useState<'all' | 'unread' | 'handled'>('all');
  /** Category type or '' for any */
  const [typeFilter, setTypeFilter] = useState<'' | NotificationTypeId>('');
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHint, setPushHint] = useState('');
  const [canPush, setCanPush] = useState(false);
  const [isStaffViewer, setIsStaffViewer] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsStaffViewer(window.location.pathname.startsWith('/admin'));
  }, [open]);

  const load = () => {
    fetch('/api/user/notifications')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items);
        setUnread(typeof d.unread === 'number' ? d.unread : 0);
      })
      .catch(() => undefined);
  };

  const refreshPush = () => {
    if (!pushSupported()) {
      setCanPush(false);
      return;
    }
    setCanPush(true);
    getPushStatus()
      .then((s) => {
        setPushOn(s.subscribed && s.permission === 'granted');
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    refreshPush();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'YP_NAVIGATE' && typeof event.data.url === 'string') {
        window.location.assign(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const isNarrow = window.innerWidth < 480;
    const width = isNarrow
      ? Math.min(window.innerWidth - 16, 420)
      : Math.min(380, window.innerWidth - 16);
    let left = isNarrow ? 8 : rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    const maxPanel = Math.min(isNarrow ? window.innerHeight - 20 : 520, window.innerHeight - 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    let top = rect.bottom + 8;
    if (spaceBelow < 280 && rect.top > spaceBelow) {
      top = Math.max(8, rect.top - maxPanel - 8);
    }
    if (top + maxPanel > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - maxPanel - 8);
    }
    setPos({ top, left, width, maxHeight: maxPanel });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const panel = document.getElementById('yp-notif-panel');
      if (panel?.contains(t)) return;
      // Backdrop handles its own close; ignore if click is on backdrop
      if ((t as HTMLElement)?.closest?.('.yp-notif-backdrop')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  // Lock body scroll lightly on narrow screens while open
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined' || window.innerWidth > 480) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of items) {
      map[i.type] = (map[i.type] || 0) + 1;
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (scope === 'unread') list = list.filter((i) => !i.readAt);
    if (scope === 'handled') {
      list = list.filter((i) => {
        const meta = parseNotificationMeta(i.meta);
        return Boolean(meta.handled) || Boolean(i.readAt);
      });
    }
    if (typeFilter) list = list.filter((i) => i.type === typeFilter);
    // Newest first — stable chronological order in the panel
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [items, scope, typeFilter]);

  const handledCount = useMemo(
    () =>
      items.filter((i) => {
        const meta = parseNotificationMeta(i.meta);
        return Boolean(meta.handled) || Boolean(i.readAt);
      }).length,
    [items]
  );

  const markAll = async () => {
    await fetch('/api/user/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    load();
  };

  const markOne = async (id: string) => {
    await fetch('/api/user/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushHint('');
    try {
      if (pushOn) {
        await disableWebPush();
        setPushOn(false);
        setPushHint('Пуш выключен');
      } else {
        const res = await enableWebPush();
        if (res.ok) {
          setPushOn(true);
          setPushHint('Готово — проверьте уведомление');
        } else {
          setPushHint(res.message || 'Не удалось включить');
        }
      }
      refreshPush();
    } finally {
      setPushBusy(false);
    }
  };

  const panel =
    open && pos && mounted
      ? createPortal(
          <>
            <button
              type="button"
              className="yp-notif-backdrop"
              aria-label="Закрыть уведомления"
              onClick={() => setOpen(false)}
            />
            <div
              id="yp-notif-panel"
              className="yp-notif-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Уведомления"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              <div className="yp-notif-panel__head">
                <strong>Уведомления</strong>
                <div className="yp-notif-panel__head-actions">
                  <button type="button" className="yp-notif-panel__link" onClick={() => void markAll()}>
                    Прочитать все
                  </button>
                  <button
                    type="button"
                    className="yp-modal-close yp-notif-panel__close"
                    aria-label="Закрыть"
                    title="Закрыть"
                    onClick={() => setOpen(false)}
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

            {canPush ? (
              <div className={`yp-notif-panel__push${pushOn ? ' is-on' : ''}`}>
                <button
                  type="button"
                  className="yp-notif-panel__push-btn"
                  disabled={pushBusy}
                  onClick={() => void togglePush()}
                  aria-pressed={pushOn}
                >
                  {pushOn ? <BellRing size={15} /> : <BellOff size={15} />}
                  <span>{pushOn ? 'Пуш включён' : 'Пуш выключен'}</span>
                  <span className="yp-notif-panel__push-action">
                    {pushBusy ? '…' : pushOn ? 'Выкл' : 'Вкл'}
                  </span>
                </button>
                {pushHint ? <p className="yp-notif-panel__push-hint">{pushHint}</p> : null}
              </div>
            ) : null}

            <div className="yp-notif-panel__filters">
              <div className="yp-notif-panel__scope" role="tablist" aria-label="Статус">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'all'}
                  className={`yp-notif-panel__scope-btn${scope === 'all' ? ' is-active' : ''}`}
                  onClick={() => setScope('all')}
                >
                  Все
                  {items.length > 0 ? <span className="yp-notif-panel__count">{items.length}</span> : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'unread'}
                  className={`yp-notif-panel__scope-btn${scope === 'unread' ? ' is-active' : ''}`}
                  onClick={() => setScope('unread')}
                >
                  Новые
                  {unread > 0 ? <span className="yp-notif-panel__count is-hot">{unread}</span> : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'handled'}
                  className={`yp-notif-panel__scope-btn${scope === 'handled' ? ' is-active' : ''}`}
                  onClick={() => setScope('handled')}
                >
                  Прочитанные
                  {handledCount > 0 ? <span className="yp-notif-panel__count">{handledCount}</span> : null}
                </button>
              </div>

              <div className="yp-notif-panel__cats" role="group" aria-label="Категория">
                <button
                  type="button"
                  className={`yp-notif-panel__cat${typeFilter === '' ? ' is-active' : ''}`}
                  onClick={() => setTypeFilter('')}
                >
                  Все
                </button>
                {TYPE_OPTIONS.map((t) => {
                  const n = typeCounts[t.id] || 0;
                  if (n === 0 && typeFilter !== t.id) return null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`yp-notif-panel__cat${typeFilter === t.id ? ' is-active' : ''}`}
                      onClick={() => setTypeFilter(t.id)}
                    >
                      {t.label}
                      <span className="yp-notif-panel__cat-n">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="yp-notif-panel__list">
              {filtered.length === 0 ? (
                <div className="yp-notif-panel__empty">
                  {items.length === 0
                    ? 'Пока нет уведомлений'
                    : scope === 'unread'
                      ? 'Нет непрочитанных'
                      : scope === 'handled'
                        ? 'Нет прочитанных'
                      : 'В этой категории пусто'}
                </div>
              ) : (
                filtered.map((n) => {
                  const href = resolveNotificationHref(n, { isStaffViewer });
                  const meta = parseNotificationMeta(n.meta);
                  const actor = notificationActorLine(meta, { isStaffViewer });
                  const inner = (
                    <>
                      <div className="yp-notif-panel__item-meta">
                        <span className="yp-notif-panel__type-chip">{notificationTypeLabel(n.type)}</span>
                        <time dateTime={n.createdAt}>
                          {new Date(n.createdAt).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Moscow',
                          })}
                        </time>
                      </div>
                      <div className={`yp-notif-panel__item-title${n.readAt ? '' : ' is-unread'}`}>
                        {n.title}
                      </div>
                      <div className="yp-notif-panel__item-body">{n.body}</div>
                      {actor ? <div className="yp-notif-panel__item-actor">{actor}</div> : null}
                    </>
                  );
                  if (href) {
                    return (
                      <Link
                        key={n.id}
                        href={href}
                        className={`yp-notif-panel__item${n.readAt ? '' : ' is-unread'}`}
                        onClick={() => {
                          if (!n.readAt) void markOne(n.id);
                          setOpen(false);
                        }}
                      >
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`yp-notif-panel__item${n.readAt ? '' : ' is-unread'}`}
                      onClick={() => {
                        if (!n.readAt) void markOne(n.id);
                      }}
                    >
                      {inner}
                    </button>
                  );
                })
              )}
            </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`yp-notif-bell${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}${useNavStyle ? ' is-nav-style' : ''}`}
        aria-label="Уведомления"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          load();
          refreshPush();
        }}
      >
        <Bell size={compact ? 16 : 18} />
        {unread > 0 ? (
          <span className="yp-notif-bell__badge">{unread > 999 ? '999+' : unread}</span>
        ) : null}
      </button>
      {panel}
    </>
  );
}
