'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabId = 'max' | 'telegram';

type LinkedUser = {
  id: string;
  name: string | null;
  email: string | null;
  publicCode: string | null;
  maxUserId?: string | null;
  telegramChatId?: string | null;
};

type BotsStatus = {
  max: {
    enabled: boolean;
    hasToken: boolean;
    hasSecret: boolean;
    alertIds: string[];
    me: unknown;
    subscriptions: unknown;
    apiBase: string;
    certOk?: boolean;
    certHint?: string;
    updateTypes?: string[];
  };
  telegram: {
    enabled: boolean;
    hasToken: boolean;
    alertIds: string[];
    dailyBackupEnabled?: boolean;
    dailyBackupChatId?: string | null;
    dailyBackupHour?: number | null;
    webhookUrl?: string;
  };
  linked: {
    max: LinkedUser[];
    telegram: LinkedUser[];
  };
  publicSiteUrl?: string | null;
};

const MAX_UPDATE_TYPES = [
  { id: 'message_created', label: 'Входящие сообщения' },
  { id: 'message_callback', label: 'Нажатия кнопок' },
  { id: 'bot_started', label: 'Старт бота (/start)' },
] as const;

async function readJson<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
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
    const v = draft.replace(/[^0-9]/g, '').trim();
    if (!v) {
      toast.error('Укажите числовой ID');
      return;
    }
    if (ids.includes(v)) {
      toast.error('Этот ID уже в списке');
      return;
    }
    onChange([...ids, v]);
    setDraft('');
  };

  return (
    <div className="bots-id-editor">
      <div className="bots-id-editor__list">
        {ids.length === 0 ? (
          <p className="bots-muted">Пока никого нет — добавьте ID или выберите из профилей ниже.</p>
        ) : (
          ids.map((id) => (
            <span key={id} className="bots-id-chip">
              {id}
              <button
                type="button"
                aria-label={`Удалить ${id}`}
                onClick={() => onChange(ids.filter((x) => x !== id))}
              >
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
        />
        <button type="button" className="bots-btn bots-btn--secondary" onClick={add}>
          <Plus size={14} /> Добавить
        </button>
      </div>
    </div>
  );
}

export default function AdminBotsClient({ initial }: { initial?: Partial<BotsStatus> | null }) {
  const [tab, setTab] = useState<TabId>('max');
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<BotsStatus | null>((initial as BotsStatus) || null);

  const [maxEnabled, setMaxEnabled] = useState(Boolean(initial?.max?.enabled));
  const [maxToken, setMaxToken] = useState('');
  const [maxSecret, setMaxSecret] = useState('');
  const [maxIds, setMaxIds] = useState<string[]>(initial?.max?.alertIds || []);
  const [maxTypes, setMaxTypes] = useState<string[]>(
    initial?.max?.updateTypes?.length
      ? initial.max.updateTypes
      : MAX_UPDATE_TYPES.map((t) => t.id)
  );
  const [maxTestId, setMaxTestId] = useState('');

  const [tgEnabled, setTgEnabled] = useState(Boolean(initial?.telegram?.enabled));
  const [tgToken, setTgToken] = useState('');
  const [tgIds, setTgIds] = useState<string[]>(initial?.telegram?.alertIds || []);
  const [tgBackup, setTgBackup] = useState(Boolean(initial?.telegram?.dailyBackupEnabled));
  const [tgBackupChat, setTgBackupChat] = useState(initial?.telegram?.dailyBackupChatId || '');
  const [tgBackupHour, setTgBackupHour] = useState(initial?.telegram?.dailyBackupHour ?? 3);
  const [tgTestId, setTgTestId] = useState('');

  const applyStatus = useCallback((d: BotsStatus) => {
    setStatus(d);
    setMaxEnabled(Boolean(d.max?.enabled));
    setMaxIds(d.max?.alertIds || []);
    setMaxTypes(
      d.max?.updateTypes?.length ? d.max.updateTypes : MAX_UPDATE_TYPES.map((t) => t.id)
    );
    setTgEnabled(Boolean(d.telegram?.enabled));
    setTgIds(d.telegram?.alertIds || []);
    setTgBackup(Boolean(d.telegram?.dailyBackupEnabled));
    setTgBackupChat(d.telegram?.dailyBackupChatId || '');
    setTgBackupHour(d.telegram?.dailyBackupHour ?? 3);
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
    if (!initial) void reload();
  }, [initial, reload]);

  const maxMeLabel = useMemo(() => {
    const me = status?.max?.me as { username?: string; name?: string; user_id?: number; error?: string } | null;
    if (!me) return null;
    if (me.error) return String(me.error);
    return [me.name, me.username ? `@${me.username}` : null, me.user_id ? `id ${me.user_id}` : null]
      .filter(Boolean)
      .join(' · ');
  }, [status]);

  const saveMax = async () => {
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
        }),
      });
      const d = await readJson<{ message?: string } & BotsStatus>(res);
      if (!res.ok) throw new Error(d?.message || 'Не сохранено');
      toast.success('MAX сохранён');
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
        }),
      });
      const d = await readJson<{ message?: string } & BotsStatus>(res);
      if (!res.ok) throw new Error(d?.message || 'Не сохранено');
      toast.success('Telegram сохранён');
      setTgToken('');
      if (d && 'telegram' in d) applyStatus(d as BotsStatus);
      else await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await readJson<{ ok?: boolean; message?: string; reason?: string; body?: string }>(res);
      if (!res.ok || d?.ok === false) {
        throw new Error(d?.message || d?.reason || d?.body || 'Не удалось');
      }
      toast.success(d?.message || 'Готово');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="bots-page bots-page--loading">
        <Loader2 className="bots-spin" size={22} /> Загрузка настроек ботов…
      </div>
    );
  }

  return (
    <div className="bots-page admin-page-shell">
      <div className="bots-page__head">
        <div>
          <h1>
            <Bot size={22} aria-hidden /> Боты
          </h1>
          <p>
            MAX и Telegram для модерации и оповещений. Пользователи указывают свои ID в{' '}
            <a href="/dashboard?tab=profile&section=edit">профиле → Редактировать</a>.
          </p>
        </div>
        <button type="button" className="bots-btn bots-btn--ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'bots-spin' : undefined} /> Обновить
        </button>
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

      {tab === 'max' ? (
        <div className="bots-panel tab-content" role="tabpanel">
          <section className="bots-card">
            <div className="bots-card__row">
              <div>
                <h2>Включить MAX-бота</h2>
                <p className="bots-muted">Оповещения и кнопки модерации в MAX.</p>
              </div>
              <label className="bots-toggle">
                <input
                  type="checkbox"
                  checked={maxEnabled}
                  onChange={(e) => setMaxEnabled(e.target.checked)}
                />
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
              placeholder={
                status?.max?.hasSecret
                  ? 'Оставьте пустым — не менять (или сгенерируем при регистрации)'
                  : 'Буквы/цифры/_/- , от 5 символов'
              }
            />
            <p className="bots-hint">
              API: <code>{status?.max?.apiBase || 'https://platform-api2.max.ru'}</code>
              {maxMeLabel ? (
                <>
                  {' '}
                  · бот: <strong>{maxMeLabel}</strong>
                </>
              ) : null}
            </p>
          </section>

          <section className="bots-card">
            <h2>
              <Shield size={16} /> Сертификат TLS (Минцифры)
            </h2>
            <p className="bots-muted">
              Для запросов к platform-api2.max.ru нужен корневой сертификат Минцифры. В Docker задано{' '}
              <code>NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca.pem</code>, файлы в{' '}
              <code>./certs/</code> на сервере.
            </p>
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
            <ol className="bots-steps">
              <li>
                Скачайте цепочку с{' '}
                <a href="https://www.gosuslugi.ru/crt" target="_blank" rel="noreferrer">
                  gosuslugi.ru/crt
                </a>{' '}
                (корневой + промежуточный).
              </li>
              <li>
                Соберите PEM в <code>/opt/sochi-portal/certs/russian_trusted_ca.pem</code>.
              </li>
              <li>
                Перезапустите контейнер <code>web</code> с переменной <code>NODE_EXTRA_CA_CERTS</code>.
              </li>
            </ol>
          </section>

          <section className="bots-card">
            <h2>
              <Bell size={16} /> Возможности бота (типы событий)
            </h2>
            <p className="bots-muted">Что подписываем при регистрации вебхука.</p>
            <div className="bots-caps">
              {MAX_UPDATE_TYPES.map((t) => (
                <label key={t.id} className="bots-cap">
                  <input
                    type="checkbox"
                    checked={maxTypes.includes(t.id)}
                    onChange={(e) => {
                      setMaxTypes((prev) =>
                        e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)
                      );
                    }}
                  />
                  {t.label}
                  <code>{t.id}</code>
                </label>
              ))}
            </div>
            <div className="bots-actions">
              <button
                type="button"
                className="bots-btn bots-btn--secondary"
                disabled={busy === 'ensureMaxWebhook'}
                onClick={() =>
                  void runAction('ensureMaxWebhook', { updateTypes: maxTypes })
                }
              >
                {busy === 'ensureMaxWebhook' ? <Loader2 size={14} className="bots-spin" /> : <RefreshCw size={14} />}
                Зарегистрировать вебхук
              </button>
              <button
                type="button"
                className="bots-btn bots-btn--ghost"
                onClick={() => {
                  const url = `${(status?.publicSiteUrl || 'https://young.idivles.ru').replace(/\/$/, '')}/api/integrations/max/webhook`;
                  void navigator.clipboard.writeText(url).then(
                    () => toast.success('URL вебхука скопирован'),
                    () => toast.error('Не удалось скопировать')
                  );
                }}
              >
                <Copy size={14} /> URL вебхука
              </button>
            </div>
          </section>

          <section className="bots-card">
            <h2>
              <Users size={16} /> Получатели оповещений (MAX ID)
            </h2>
            <p className="bots-muted">
              Числовые user_id. Пользователь должен написать боту /start, иначе dialog.not.found.
            </p>
            <IdListEditor ids={maxIds} onChange={setMaxIds} placeholder="MAX user_id" />
            {(status?.linked?.max || []).length > 0 ? (
              <div className="bots-linked">
                <div className="bots-label">Из профилей пользователей</div>
                {status!.linked.max.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="bots-linked__row"
                    onClick={() => {
                      const id = String(u.maxUserId || '');
                      if (!id) return;
                      if (maxIds.includes(id)) {
                        toast('Уже в списке');
                        return;
                      }
                      setMaxIds([...maxIds, id]);
                      toast.success(`Добавлен ${id}`);
                    }}
                  >
                    <span>
                      {u.name || u.email || u.publicCode || u.id}
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
                placeholder="user_id для теста (пусто = всем из списка)"
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
                Отправить тест
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
      ) : (
        <div className="bots-panel tab-content" role="tabpanel">
          <section className="bots-card">
            <div className="bots-card__row">
              <div>
                <h2>Включить Telegram-оповещения</h2>
                <p className="bots-muted">Заявки, брони и модерация в Telegram.</p>
              </div>
              <label className="bots-toggle">
                <input
                  type="checkbox"
                  checked={tgEnabled}
                  onChange={(e) => setTgEnabled(e.target.checked)}
                />
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
            <div className="bots-actions" style={{ marginTop: '0.75rem' }}>
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
                Подключить мой chat ID
              </button>
            </div>
            <p className="bots-hint">
              Вебхук: <code>/api/integrations/telegram/webhook</code>. Пользователь один раз жмёт Start у
              бота, затем указывает chat ID в профиле.
            </p>
          </section>

          <section className="bots-card">
            <h2>
              <Users size={16} /> Получатели (Telegram chat ID)
            </h2>
            <IdListEditor ids={tgIds} onChange={setTgIds} placeholder="chat_id" />
            {(status?.linked?.telegram || []).length > 0 ? (
              <div className="bots-linked">
                <div className="bots-label">Из профилей пользователей</div>
                {status!.linked.telegram.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="bots-linked__row"
                    onClick={() => {
                      const id = String(u.telegramChatId || '');
                      if (!id) return;
                      if (tgIds.includes(id)) {
                        toast('Уже в списке');
                        return;
                      }
                      setTgIds([...tgIds, id]);
                      toast.success(`Добавлен ${id}`);
                    }}
                  >
                    <span>
                      {u.name || u.email || u.publicCode || u.id}
                      <small>TG {u.telegramChatId}</small>
                    </span>
                    <Plus size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="bots-hint">Пока никто не указал Telegram chat ID в профиле.</p>
            )}
          </section>

          <section className="bots-card">
            <h2>Ежедневный бэкап в Telegram</h2>
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
              placeholder="Один chat ID админа"
            />
            <label className="bots-label">Час отправки (МСК, 0–23)</label>
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
                placeholder="chat_id для теста (пусто = всем из списка)"
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
                Отправить тест
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
      )}
    </div>
  );
}
