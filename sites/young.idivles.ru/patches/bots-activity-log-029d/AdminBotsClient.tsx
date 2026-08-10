'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { BotChannelConfig, BotChannelNotify, BotsConfig } from '@/lib/bots-config';

type TabId = 'max' | 'telegram';

type LinkedUser = {
  id: string;
  name: string | null;
  email: string | null;
  publicCode: string | null;
  maxUserId?: string | null;
  telegramChatId?: string | null;
};

type RecentRow = {
  id: string;
  action: string;
  summary: string | null;
  success: boolean;
  createdAt: string;
  userEmail: string | null;
};

type BotsStatus = {
  config: BotsConfig;
  max: {
    enabled: boolean;
    hasToken: boolean;
    hasSecret: boolean;
    alertIds: string[];
    me: unknown;
    subscriptions: { url?: string; update_types?: string[] }[];
    webhookUrl?: string;
    webhookActive?: boolean;
    apiBase: string;
    certOk?: boolean;
    certHint?: string;
    updateTypes?: string[];
    linkedCount?: number;
    recipientCount?: number;
  };
  telegram: {
    enabled: boolean;
    hasToken: boolean;
    alertIds: string[];
    dailyBackupEnabled?: boolean;
    dailyBackupChatId?: string | null;
    dailyBackupHour?: number | null;
    webhookUrl?: string;
    me?: unknown;
    webhookInfo?: unknown;
    linkedCount?: number;
    recipientCount?: number;
  };
  linked: { max: LinkedUser[]; telegram: LinkedUser[] };
  recent?: RecentRow[];
  publicSiteUrl?: string | null;
  stats?: { maxLinked: number; tgLinked: number; maxRecipients: number; tgRecipients: number };
};

const MAX_UPDATE_TYPES = [
  { id: 'message_created', label: 'Входящие сообщения' },
  { id: 'message_callback', label: 'Нажатия кнопок' },
  { id: 'bot_started', label: 'Старт бота (/start)' },
] as const;

const NOTIFY_OPTS: { key: keyof BotChannelNotify; label: string; hint: string }[] = [
  { key: 'applications', label: 'Заявки на программы', hint: 'Новые заявки с кнопками одобрения' },
  { key: 'bookings', label: 'Брони и афиша', hint: 'Заявки на пространства и события' },
  { key: 'moderation', label: 'Модерация чатов', hint: 'Жалобы и очередь модерации' },
  { key: 'portfolio', label: 'Портфолио', hint: 'Отправки портфолио на проверку' },
];

async function readJson<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function IdListEditor({
  ids,
  onChange,
  placeholder,
}: {
  ids: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.replace(/[^0-9-]/g, '').trim();
    if (!v) return toast.error('Укажите числовой ID');
    if (ids.includes(v)) return toast.error('Этот ID уже в списке');
    onChange([...ids, v]);
    setDraft('');
  };
  return (
    <div className="bots-id-editor">
      <div className="bots-id-editor__list">
        {ids.length === 0 ? (
          <p className="bots-muted">Пока никого нет — добавьте ID или выберите из профилей.</p>
        ) : (
          ids.map((id) => (
            <span key={id} className="bots-id-chip">
              {id}
              <button type="button" aria-label={`Удалить ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
                <Trash2 size={12} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="bots-id-editor__add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          inputMode="numeric"
          className="settings-input"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button type="button" className="bots-btn bots-btn--secondary" onClick={add}>
          <Plus size={14} /> Добавить
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  ok,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean | null;
  hint?: string;
}) {
  return (
    <div className={`bots-stat${ok === true ? ' is-ok' : ok === false ? ' is-bad' : ''}`} title={hint}>
      <div className="bots-stat__icon">{icon}</div>
      <div className="bots-stat__body">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ChannelExtras({
  channel,
  onChange,
  showUpdateTypes,
  updateTypes,
  onTypesChange,
}: {
  channel: BotChannelConfig;
  onChange: (next: BotChannelConfig) => void;
  showUpdateTypes?: boolean;
  updateTypes?: string[];
  onTypesChange?: (types: string[]) => void;
}) {
  return (
    <>
      <section className="bots-card">
        <h2>
          <Bell size={16} /> Что присылать
        </h2>
        <div className="bots-caps">
          {NOTIFY_OPTS.map((o) => (
            <label key={o.key} className="bots-cap bots-cap--block">
              <input
                type="checkbox"
                checked={channel.notify[o.key]}
                onChange={(e) =>
                  onChange({
                    ...channel,
                    notify: { ...channel.notify, [o.key]: e.target.checked },
                  })
                }
              />
              <span>
                <strong>{o.label}</strong>
                <small>{o.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="bots-card">
        <h2>
          <Clock size={16} /> Тихие часы (МСК)
        </h2>
        <p className="bots-muted">В этом окне оповещения не отправляются. Оставьте пустым — круглосуточно.</p>
        <div className="bots-quiet">
          <label>
            С
            <input
              type="number"
              min={0}
              max={23}
              className="settings-input"
              value={channel.quietFrom ?? ''}
              placeholder="—"
              onChange={(e) =>
                onChange({
                  ...channel,
                  quietFrom: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            До
            <input
              type="number"
              min={0}
              max={23}
              className="settings-input"
              value={channel.quietTo ?? ''}
              placeholder="—"
              onChange={(e) =>
                onChange({
                  ...channel,
                  quietTo: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="bots-card">
        <h2>
          <MessageSquare size={16} /> Текст приветствия (/start)
        </h2>
        <textarea
          className="settings-input"
          rows={3}
          value={channel.welcomeText}
          placeholder="Пусто = стандартный текст бота с подсказкой про ID"
          onChange={(e) => onChange({ ...channel, welcomeText: e.target.value })}
        />
      </section>

      {showUpdateTypes ? (
        <section className="bots-card">
          <h2>
            <Webhook size={16} /> События вебхука MAX
          </h2>
          <div className="bots-caps">
            {MAX_UPDATE_TYPES.map((t) => (
              <label key={t.id} className="bots-cap">
                <input
                  type="checkbox"
                  checked={(updateTypes || []).includes(t.id)}
                  onChange={(e) => {
                    const cur = updateTypes || [];
                    onTypesChange?.(
                      e.target.checked ? [...cur, t.id] : cur.filter((x) => x !== t.id)
                    );
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export default function AdminBotsClient() {
  const [tab, setTab] = useState<TabId>('max');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<BotsStatus | null>(null);

  const [maxEnabled, setMaxEnabled] = useState(false);
  const [maxToken, setMaxToken] = useState('');
  const [maxSecret, setMaxSecret] = useState('');
  const [maxIds, setMaxIds] = useState<string[]>([]);
  const [maxTypes, setMaxTypes] = useState<string[]>(MAX_UPDATE_TYPES.map((t) => t.id));
  const [maxCfg, setMaxCfg] = useState<BotChannelConfig | null>(null);
  const [maxTestId, setMaxTestId] = useState('');

  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [tgIds, setTgIds] = useState<string[]>([]);
  const [tgBackup, setTgBackup] = useState(false);
  const [tgBackupChat, setTgBackupChat] = useState('');
  const [tgBackupHour, setTgBackupHour] = useState(3);
  const [tgCfg, setTgCfg] = useState<BotChannelConfig | null>(null);
  const [tgTestId, setTgTestId] = useState('');

  const applyStatus = useCallback((d: BotsStatus) => {
    setStatus(d);
    setMaxEnabled(Boolean(d.max?.enabled));
    setMaxIds(d.max?.alertIds || []);
    setMaxTypes(d.max?.updateTypes?.length ? d.max.updateTypes : MAX_UPDATE_TYPES.map((t) => t.id));
    setMaxCfg(d.config?.max || null);
    setTgEnabled(Boolean(d.telegram?.enabled));
    setTgIds(d.telegram?.alertIds || []);
    setTgBackup(Boolean(d.telegram?.dailyBackupEnabled));
    setTgBackupChat(d.telegram?.dailyBackupChatId || '');
    setTgBackupHour(d.telegram?.dailyBackupHour ?? 3);
    setTgCfg(d.config?.telegram || null);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bots', { cache: 'no-store' });
      const d = await readJson<BotsStatus & { message?: string }>(res);
      if (!res.ok || !d) throw new Error(d?.message || 'Не удалось загрузить');
      applyStatus(d as BotsStatus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const maxMeLabel = useMemo(() => {
    const me = status?.max?.me as { username?: string; name?: string; user_id?: number; error?: string } | null;
    if (!me) return '—';
    if (me.error) return 'ошибка';
    return [me.name, me.username ? `@${me.username}` : null].filter(Boolean).join(' · ') || '—';
  }, [status]);

  const tgMeLabel = useMemo(() => {
    const me = status?.telegram?.me as { username?: string; first_name?: string; error?: string } | null;
    if (!me) return '—';
    if (me.error) return 'ошибка';
    return [me.first_name, me.username ? `@${me.username}` : null].filter(Boolean).join(' · ') || '—';
  }, [status]);

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await readJson<{ ok?: boolean; message?: string; reason?: string } & BotsStatus>(res);
      if (!res.ok || d?.ok === false) throw new Error(d?.message || d?.reason || 'Не удалось');
      toast.success(d?.message || 'Готово');
      if (d && 'max' in d) applyStatus(d as BotsStatus);
      else await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  };

  const saveMax = async () => {
    if (!maxCfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveMax',
          enabled: maxEnabled,
          token: maxToken || undefined,
          secret: maxSecret || undefined,
          alertIds: maxIds,
          updateTypes: maxTypes,
          config: { ...maxCfg, updateTypes: maxTypes },
        }),
      });
      const d = await readJson<{ message?: string } & BotsStatus>(res);
      if (!res.ok) throw new Error(d?.message || 'Не сохранено');
      toast.success(d?.message || 'MAX сохранён');
      setMaxToken('');
      setMaxSecret('');
      if (d && 'max' in d) applyStatus(d as BotsStatus);
      else await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const saveTelegram = async () => {
    if (!tgCfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveTelegram',
          enabled: tgEnabled,
          token: tgToken || undefined,
          alertIds: tgIds,
          dailyBackupEnabled: tgBackup,
          dailyBackupChatId: tgBackupChat,
          dailyBackupHour: tgBackupHour,
          config: tgCfg,
        }),
      });
      const d = await readJson<{ message?: string } & BotsStatus>(res);
      if (!res.ok) throw new Error(d?.message || 'Не сохранено');
      toast.success(d?.message || 'Telegram сохранён');
      setTgToken('');
      if (d && 'telegram' in d) applyStatus(d as BotsStatus);
      else await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="bots-page bots-page--loading">
        <Loader2 className="bots-spin" size={22} /> Загрузка настроек ботов…
      </div>
    );
  }

  const tgHook = status?.telegram?.webhookInfo as { url?: string; pending_update_count?: number } | null;

  return (
    <div className="bots-page admin-page-shell">
      <div className="bots-page__head">
        <div>
          <h1>
            <Bot size={22} aria-hidden /> Боты
          </h1>
          <p>
            MAX и Telegram для модерации и оповещений. Пользователи указывают ID в{' '}
            <a href="/dashboard?tab=profile&section=edit">профиле → Редактировать</a>. Журнал действий — в{' '}
            <a href="/admin/activity">Активность</a>.
          </p>
        </div>
        <button type="button" className="bots-btn bots-btn--ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'bots-spin' : undefined} /> Обновить
        </button>
      </div>

      <div className="bots-stats">
        <StatusCard
          icon={<Bot size={16} />}
          label="MAX-бот"
          value={status?.max?.enabled ? maxMeLabel : 'выкл'}
          ok={status?.max?.enabled ? status.max.certOk : null}
          hint={status?.max?.certHint}
        />
        <StatusCard
          icon={<Webhook size={16} />}
          label="Вебхук MAX"
          value={status?.max?.webhookActive ? 'активен' : 'нет'}
          ok={status?.max?.webhookActive ?? false}
        />
        <StatusCard
          icon={<MessageSquare size={16} />}
          label="Telegram"
          value={status?.telegram?.enabled ? tgMeLabel : 'выкл'}
          ok={status?.telegram?.enabled ? Boolean(status.telegram.hasToken) : null}
        />
        <StatusCard
          icon={<Users size={16} />}
          label="Связанные ID"
          value={`MAX ${status?.stats?.maxLinked ?? 0} · TG ${status?.stats?.tgLinked ?? 0}`}
        />
      </div>

      <div className="bots-tabs" role="tablist" aria-label="Мессенджеры">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'max'}
          className={`bots-tab${tab === 'max' ? ' is-active' : ''}`}
          onClick={() => setTab('max')}
        >
          MAX
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'telegram'}
          className={`bots-tab${tab === 'telegram' ? ' is-active' : ''}`}
          onClick={() => setTab('telegram')}
        >
          Telegram
        </button>
      </div>

      {tab === 'max' && maxCfg ? (
        <div className="bots-panel" role="tabpanel">
          <section className="bots-card">
            <div className="bots-card__row">
              <div>
                <h2>Включить MAX-бота</h2>
                <p className="bots-muted">Оповещения и кнопки модерации в MAX.</p>
              </div>
              <label className="bots-toggle">
                <input type="checkbox" checked={maxEnabled} onChange={(e) => setMaxEnabled(e.target.checked)} />
                <span />
              </label>
            </div>
            <label className="bots-label">Токен бота</label>
            <input
              type="password"
              autoComplete="off"
              className="settings-input"
              value={maxToken}
              onChange={(e) => setMaxToken(e.target.value)}
              placeholder={status?.max?.hasToken ? 'Оставьте пустым — не менять' : 'Токен из кабинета MAX'}
            />
            <label className="bots-label">Секрет вебхука</label>
            <input
              type="password"
              autoComplete="off"
              className="settings-input"
              value={maxSecret}
              onChange={(e) => setMaxSecret(e.target.value)}
              placeholder={status?.max?.hasSecret ? 'Оставьте пустым — не менять' : 'a-z A-Z 0-9 _ - от 5 символов'}
            />
            <p className="bots-hint">
              API: <code>{status?.max?.apiBase}</code>
              {status?.max?.webhookUrl ? (
                <>
                  {' '}
                  · вебхук: <code>{status.max.webhookUrl}</code>
                </>
              ) : null}
            </p>
          </section>

          <section className="bots-card">
            <h2>
              <Shield size={16} /> Сертификат TLS (Минцифры)
            </h2>
            <div className={`bots-cert${status?.max?.certOk ? ' is-ok' : ' is-bad'}`}>
              {status?.max?.certOk ? (
                <>
                  <CheckCircle2 size={16} /> Соединение с API MAX доступно
                </>
              ) : (
                <>
                  <Shield size={16} /> {status?.max?.certHint || 'Проверьте сертификат и токен'}
                </>
              )}
            </div>
            <p className="bots-muted">
              В Docker: <code>NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca.pem</code>, файлы в{' '}
              <code>./certs/</code>.
            </p>
            <div className="bots-actions">
              <button
                type="button"
                className="bots-btn bots-btn--secondary"
                disabled={busy === 'ensureMaxWebhook'}
                onClick={() => void runAction('ensureMaxWebhook', { updateTypes: maxTypes })}
              >
                {busy === 'ensureMaxWebhook' ? <Loader2 size={14} className="bots-spin" /> : <RefreshCw size={14} />}
                Зарегистрировать вебхук
              </button>
              <button
                type="button"
                className="bots-btn bots-btn--ghost"
                disabled={busy === 'attachMyMax'}
                onClick={() => void runAction('attachMyMax')}
              >
                <Link2 size={14} /> Подключить мой MAX ID
              </button>
            </div>
          </section>

          <ChannelExtras
            channel={maxCfg}
            onChange={setMaxCfg}
            showUpdateTypes
            updateTypes={maxTypes}
            onTypesChange={setMaxTypes}
          />

          <section className="bots-card">
            <h2>
              <Users size={16} /> Получатели (MAX ID)
            </h2>
            <IdListEditor ids={maxIds} onChange={setMaxIds} placeholder="MAX user_id" />
            {(status?.linked?.max || []).length > 0 ? (
              <div className="bots-linked">
                <div className="bots-label">Из профилей</div>
                {status!.linked.max.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="bots-linked__row"
                    onClick={() => {
                      const id = String(u.maxUserId || '');
                      if (!id || maxIds.includes(id)) return toast('Уже в списке');
                      setMaxIds([...maxIds, id]);
                      toast.success(`Добавлен ${id}`);
                    }}
                  >
                    <span>
                      {u.name || u.email || u.publicCode}
                      <small>MAX {u.maxUserId}</small>
                    </span>
                    <Plus size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="bots-hint">Пока никто не указал MAX ID в профиле.</p>
            )}
          </section>

          <section className="bots-card">
            <h2>
              <Send size={16} /> Тест
            </h2>
            <div className="bots-id-editor__add">
              <input
                className="settings-input"
                value={maxTestId}
                onChange={(e) => setMaxTestId(e.target.value)}
                placeholder="user_id (пусто = всем из списка)"
                inputMode="numeric"
              />
              <button
                type="button"
                className="bots-btn bots-btn--secondary"
                disabled={busy === 'testMax'}
                onClick={() =>
                  void runAction('testMax', { userId: maxTestId.replace(/[^0-9]/g, '') || undefined })
                }
              >
                {busy === 'testMax' ? <Loader2 size={14} className="bots-spin" /> : <Send size={14} />}
                Отправить
              </button>
            </div>
          </section>

          <div className="bots-save-bar">
            <button type="button" className="bots-btn bots-btn--primary" disabled={saving} onClick={() => void saveMax()}>
              {saving ? <Loader2 size={14} className="bots-spin" /> : null}
              Сохранить MAX
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'telegram' && tgCfg ? (
        <div className="bots-panel" role="tabpanel">
          <section className="bots-card">
            <div className="bots-card__row">
              <div>
                <h2>Включить Telegram-оповещения</h2>
                <p className="bots-muted">Заявки, брони и модерация в Telegram.</p>
              </div>
              <label className="bots-toggle">
                <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
                <span />
              </label>
            </div>
            <label className="bots-label">Токен бота</label>
            <input
              type="password"
              autoComplete="off"
              className="settings-input"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={status?.telegram?.hasToken ? 'Оставьте пустым — не менять' : 'Токен от @BotFather'}
            />
            <p className="bots-hint">
              Бот: <strong>{tgMeLabel}</strong>
              {tgHook?.url ? (
                <>
                  {' '}
                  · вебхук: <code>{tgHook.url}</code>
                  {typeof tgHook.pending_update_count === 'number'
                    ? ` · очередь ${tgHook.pending_update_count}`
                    : ''}
                </>
              ) : null}
            </p>
            <div className="bots-actions">
              <button
                type="button"
                className="bots-btn bots-btn--secondary"
                disabled={busy === 'ensureTelegramWebhook'}
                onClick={() => void runAction('ensureTelegramWebhook')}
              >
                {busy === 'ensureTelegramWebhook' ? (
                  <Loader2 size={14} className="bots-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Зарегистрировать вебхук
              </button>
              <button
                type="button"
                className="bots-btn bots-btn--ghost"
                disabled={busy === 'attachMyTelegram'}
                onClick={() => void runAction('attachMyTelegram')}
              >
                <Link2 size={14} /> Подключить мой chat ID
              </button>
            </div>
          </section>

          <ChannelExtras channel={tgCfg} onChange={setTgCfg} />

          <section className="bots-card">
            <h2>
              <Users size={16} /> Получатели (chat ID)
            </h2>
            <IdListEditor ids={tgIds} onChange={setTgIds} placeholder="chat_id" />
            {(status?.linked?.telegram || []).length > 0 ? (
              <div className="bots-linked">
                <div className="bots-label">Из профилей</div>
                {status!.linked.telegram.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="bots-linked__row"
                    onClick={() => {
                      const id = String(u.telegramChatId || '');
                      if (!id || tgIds.includes(id)) return toast('Уже в списке');
                      setTgIds([...tgIds, id]);
                      toast.success(`Добавлен ${id}`);
                    }}
                  >
                    <span>
                      {u.name || u.email || u.publicCode}
                      <small>TG {u.telegramChatId}</small>
                    </span>
                    <Plus size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="bots-hint">Пока никто не указал Telegram chat ID.</p>
            )}
          </section>

          <section className="bots-card">
            <h2>Ежедневный бэкап</h2>
            <label className="bots-cap">
              <input type="checkbox" checked={tgBackup} onChange={(e) => setTgBackup(e.target.checked)} />
              Включить ежедневный бэкап
            </label>
            <label className="bots-label">Chat ID получателя</label>
            <input
              className="settings-input"
              value={tgBackupChat}
              onChange={(e) => setTgBackupChat(e.target.value)}
              inputMode="numeric"
            />
            <label className="bots-label">Час МСК (0–23)</label>
            <input
              className="settings-input"
              type="number"
              min={0}
              max={23}
              value={tgBackupHour}
              onChange={(e) => setTgBackupHour(Number(e.target.value))}
              style={{ maxWidth: 120 }}
            />
          </section>

          <section className="bots-card">
            <h2>
              <Send size={16} /> Тест
            </h2>
            <div className="bots-id-editor__add">
              <input
                className="settings-input"
                value={tgTestId}
                onChange={(e) => setTgTestId(e.target.value)}
                placeholder="chat_id (пусто = всем)"
                inputMode="numeric"
              />
              <button
                type="button"
                className="bots-btn bots-btn--secondary"
                disabled={busy === 'testTelegram'}
                onClick={() =>
                  void runAction('testTelegram', {
                    chatId: tgTestId.replace(/[^0-9-]/g, '') || undefined,
                  })
                }
              >
                {busy === 'testTelegram' ? <Loader2 size={14} className="bots-spin" /> : <Send size={14} />}
                Отправить
              </button>
            </div>
          </section>

          <div className="bots-save-bar">
            <button
              type="button"
              className="bots-btn bots-btn--primary"
              disabled={saving}
              onClick={() => void saveTelegram()}
            >
              {saving ? <Loader2 size={14} className="bots-spin" /> : null}
              Сохранить Telegram
            </button>
          </div>
        </div>
      ) : null}

      {(status?.recent || []).length > 0 ? (
        <section className="bots-card bots-recent">
          <h2>
            <Activity size={16} /> Последние действия с ботами
          </h2>
          <ul className="bots-recent__list">
            {status!.recent!.map((r) => (
              <li key={r.id} className={r.success ? '' : 'is-fail'}>
                <time>{fmtTime(r.createdAt)}</time>
                <span>{r.summary || r.action}</span>
                <small>{r.userEmail || '—'}</small>
              </li>
            ))}
          </ul>
          <a href="/admin/activity?category=bots" className="bots-hint">
            Весь журнал →
          </a>
        </section>
      ) : null}
    </div>
  );
}
