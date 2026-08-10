import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  maxEnsureWebhook,
  maxEnsureWebhookSecret,
  maxGetConfig,
  maxGetMe,
  maxListSubscriptions,
  maxSend,
  maxSendMessage,
  maxSetWebhook,
} from '@/lib/max';
import { getTelegramConfig, tgGetMe, tgGetWebhookInfo, tgSend, tgSetWebhook } from '@/lib/telegram';
import {
  DEFAULT_MAX_UPDATE_TYPES,
  getBotsConfig,
  parseBotsConfig,
  saveBotsConfig,
  type BotsConfig,
} from '@/lib/bots-config';
import { logAdminAction } from '@/lib/admin-audit';
import { voidLogUserAction } from '@/lib/user-action-log';

function normIds(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x).replace(/[^0-9-]/g, '').trim())
      .filter(Boolean)
      .join(',');
  }
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((x) => x.replace(/[^0-9-]/g, '').trim())
    .filter(Boolean)
    .join(',');
}

function parseSubs(json: unknown): { url?: string; update_types?: string[] }[] {
  if (!json || typeof json !== 'object') return [];
  const list = (json as { subscriptions?: unknown }).subscriptions;
  return Array.isArray(list) ? (list as { url?: string; update_types?: string[] }[]) : [];
}

async function actorMeta() {
  const session = await getServerSession(authOptions);
  return {
    actorId: session?.user?.id || 'unknown',
    actorEmail: session?.user?.email || null,
    actorRole: (session?.user as { role?: string } | undefined)?.role || null,
  };
}

async function buildStatus() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const botsCfg = parseBotsConfig((settings as { botsConfigJson?: string | null } | null)?.botsConfigJson);
  const maxCfg = await maxGetConfig();
  let me: { ok: boolean; json: unknown; text: string } | null = null;
  let subs: { ok: boolean; json: unknown; text: string } | null = null;
  let certOk = false;
  let certHint = 'Токен не задан — сначала сохраните токен бота';
  if (maxCfg.token) {
    me = await maxGetMe(maxCfg.token);
    subs = await maxListSubscriptions(maxCfg.token);
    if (me.ok) {
      certOk = true;
      certHint = 'TLS и API в порядке';
    } else if (/certificate|UNABLE_TO_VERIFY|self[- ]signed|SSL|TLS|ECONN/i.test(me.text || '')) {
      certOk = false;
      certHint = `Проблема сертификата TLS: ${me.text.slice(0, 180)}. Проверьте NODE_EXTRA_CA_CERTS и файлы в ./certs/`;
    } else {
      certOk = false;
      certHint = me.text?.slice(0, 220) || 'Не удалось связаться с API MAX';
    }
  }

  const tg = await getTelegramConfig();
  const tgMe = tg.token ? await tgGetMe(tg.token) : null;
  const tgHook = tg.token ? await tgGetWebhookInfo(tg.token) : null;

  const [maxUsers, tgUsers, recentBotLogs] = await Promise.all([
    prisma.user.findMany({
      where: { maxUserId: { not: null } },
      select: { id: true, name: true, email: true, publicCode: true, maxUserId: true },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { id: true, name: true, email: true, publicCode: true, telegramChatId: true },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.userActionLog
      .findMany({
        where: { category: 'bots' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          summary: true,
          success: true,
          createdAt: true,
          userEmail: true,
        },
      })
      .catch(() => []),
  ]);

  const publicSiteUrl =
    (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl ||
    process.env.NEXTAUTH_URL ||
    null;
  const base = (publicSiteUrl || 'https://young.idivles.ru').replace(/\/$/, '');
  const maxSubs = subs?.ok ? parseSubs(subs.json) : [];

  return {
    config: botsCfg,
    max: {
      enabled: maxCfg.enabled,
      hasToken: Boolean(maxCfg.token),
      hasSecret: Boolean(maxCfg.secret),
      alertIds: maxCfg.ids,
      me: me?.ok ? me.json : { error: me?.text },
      subscriptions: maxSubs,
      webhookUrl: `${base}/api/integrations/max/webhook`,
      webhookActive: maxSubs.some((s) => (s.url || '').includes('/api/integrations/max/webhook')),
      apiBase: process.env.MAX_API_BASE || 'https://platform-api2.max.ru',
      certOk,
      certHint,
      updateTypes: botsCfg.max.updateTypes.length
        ? botsCfg.max.updateTypes
        : DEFAULT_MAX_UPDATE_TYPES,
      linkedCount: maxUsers.length,
      recipientCount: maxCfg.ids.length,
    },
    telegram: {
      enabled: tg.enabled,
      hasToken: Boolean(tg.token),
      alertIds: tg.ids,
      dailyBackupEnabled: Boolean(
        (settings as { dailyBackupEnabled?: boolean } | null)?.dailyBackupEnabled
      ),
      dailyBackupChatId:
        (settings as { dailyBackupChatId?: string | null } | null)?.dailyBackupChatId || null,
      dailyBackupHour:
        (settings as { dailyBackupHour?: number | null } | null)?.dailyBackupHour ?? 3,
      webhookUrl: `${base}/api/integrations/telegram/webhook`,
      me: tgMe?.ok ? tgMe.result : { error: tgMe?.description },
      webhookInfo: tgHook?.ok ? tgHook.result : { error: tgHook?.description },
      linkedCount: tgUsers.length,
      recipientCount: tg.ids.length,
    },
    linked: {
      max: maxUsers.filter((u) => u.maxUserId),
      telegram: tgUsers.filter((u) => u.telegramChatId),
    },
    recent: recentBotLogs,
    publicSiteUrl,
    stats: {
      maxLinked: maxUsers.length,
      tgLinked: tgUsers.length,
      maxRecipients: maxCfg.ids.length,
      tgRecipients: tg.ids.length,
    },
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await buildStatus());
  } catch (e) {
    return aclJsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '');
    const actor = await actorMeta();

    if (action === 'saveMax') {
      const update: Record<string, unknown> = {
        maxBotEnabled: Boolean(body.enabled),
        maxAlertChatIds: normIds(body.alertIds) || null,
      };
      const token = String(body.token || '').trim();
      if (token) update.maxBotToken = token;
      const secret = String(body.secret || '').trim();
      if (secret) {
        if (!/^[a-zA-Z0-9_-]{5,256}$/.test(secret)) {
          return NextResponse.json(
            { message: 'Секрет вебхука: только a-z A-Z 0-9 _ - , длина 5–256' },
            { status: 400 }
          );
        }
        update.maxWebhookSecret = secret;
      }

      const current = await getBotsConfig();
      if (body.config && typeof body.config === 'object') {
        const incoming = body.config as Partial<BotsConfig['max']>;
        current.max = {
          ...current.max,
          ...incoming,
          notify: { ...current.max.notify, ...(incoming.notify || {}) },
        };
      }
      if (Array.isArray(body.updateTypes)) {
        current.max.updateTypes = (body.updateTypes as unknown[]).map(String).filter(Boolean);
      }

      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update,
        create: { id: '1', ...update },
      });
      await saveBotsConfig(current);

      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_SAVE',
        category: 'bots',
        summary: 'Сохранены настройки MAX',
        detail: { channel: 'max', enabled: Boolean(body.enabled) },
      });
      await logAdminAction({
        ...actor,
        action: 'BOTS_SAVE_MAX',
        targetType: 'SiteSettings',
        targetId: '1',
        detail: { enabled: Boolean(body.enabled), recipients: normIds(body.alertIds) },
      });

      return NextResponse.json({ message: 'MAX сохранён', ...(await buildStatus()) });
    }

    if (action === 'saveTelegram') {
      const update: Record<string, unknown> = {
        telegramAlertsEnabled: Boolean(body.enabled),
        telegramAlertChatIds: normIds(body.alertIds) || null,
        dailyBackupEnabled: Boolean(body.dailyBackupEnabled),
        dailyBackupChatId: String(body.dailyBackupChatId || '').replace(/[^0-9-]/g, '') || null,
        dailyBackupHour: Math.max(0, Math.min(23, Number(body.dailyBackupHour) || 3)),
      };
      const token = String(body.token || '').trim();
      if (token) update.telegramBotToken = token;

      const current = await getBotsConfig();
      if (body.config && typeof body.config === 'object') {
        const incoming = body.config as Partial<BotsConfig['telegram']>;
        current.telegram = {
          ...current.telegram,
          ...incoming,
          notify: { ...current.telegram.notify, ...(incoming.notify || {}) },
        };
      }

      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update,
        create: { id: '1', ...update },
      });
      await saveBotsConfig(current);

      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_SAVE',
        category: 'bots',
        summary: 'Сохранены настройки Telegram',
        detail: { channel: 'telegram', enabled: Boolean(body.enabled) },
      });
      await logAdminAction({
        ...actor,
        action: 'BOTS_SAVE_TELEGRAM',
        targetType: 'SiteSettings',
        targetId: '1',
        detail: { enabled: Boolean(body.enabled) },
      });

      return NextResponse.json({ message: 'Telegram сохранён', ...(await buildStatus()) });
    }

    if (action === 'ensureMaxWebhook') {
      await maxEnsureWebhookSecret();
      const cfg = await getBotsConfig();
      const types = Array.isArray(body.updateTypes)
        ? (body.updateTypes as unknown[]).map(String).filter(Boolean)
        : cfg.max.updateTypes;
      const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const base = (
        (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl ||
        process.env.NEXTAUTH_URL ||
        'https://young.idivles.ru'
      ).replace(/\/$/, '');
      const url = `${base}/api/integrations/max/webhook`;
      const secret = await maxEnsureWebhookSecret();
      const r = types?.length
        ? await maxSetWebhook(url, secret, undefined, types)
        : await maxEnsureWebhook();
      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_WEBHOOK',
        category: 'bots',
        summary: r.ok ? 'Вебхук MAX зарегистрирован' : 'Ошибка вебхука MAX',
        success: r.ok,
        detail: { channel: 'max', types },
      });
      if (!r.ok) {
        const bodyText = 'body' in r ? r.body : undefined;
        return NextResponse.json(
          {
            ok: false,
            message: ('reason' in r && r.reason) || 'Не удалось зарегистрировать вебхук',
            body: bodyText,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, message: 'Вебхук MAX зарегистрирован', ...(await buildStatus()) });
    }

    if (action === 'ensureTelegramWebhook') {
      const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const base = (
        (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl ||
        process.env.NEXTAUTH_URL ||
        'https://young.idivles.ru'
      ).replace(/\/$/, '');
      const r = await tgSetWebhook(`${base}/api/integrations/telegram/webhook`);
      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_WEBHOOK',
        category: 'bots',
        summary: r.ok ? 'Вебхук Telegram зарегистрирован' : 'Ошибка вебхука Telegram',
        success: r.ok,
        detail: { channel: 'telegram' },
      });
      if (!r.ok) {
        return NextResponse.json(
          {
            ok: false,
            message:
              (r.json as { description?: string } | null)?.description ||
              'Не удалось зарегистрировать вебхук',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: 'Вебхук Telegram зарегистрирован',
        ...(await buildStatus()),
      });
    }

    if (action === 'testMax') {
      const userId = String(body.userId || '').replace(/[^0-9]/g, '');
      const text = '✅ Тест MAX с young.idivles.ru';
      let ok = false;
      let message = '';
      if (userId) {
        const r = await maxSendMessage({ userId }, text);
        ok = r.ok;
        message = r.ok ? `Отправлено user_id ${userId}` : r.reason || 'Не отправлено';
      } else {
        const r = await maxSend(text);
        ok = r.ok;
        message = r.ok ? `Отправлено: ${r.sent}/${r.total}` : r.reason || r.errors?.[0] || 'Не отправлено';
      }
      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_TEST',
        category: 'bots',
        summary: message,
        success: ok,
        detail: { channel: 'max', userId: userId || null },
      });
      if (!ok) return NextResponse.json({ ok: false, message }, { status: 400 });
      return NextResponse.json({ ok: true, message });
    }

    if (action === 'testTelegram') {
      const chatId = String(body.chatId || '').replace(/[^0-9-]/g, '');
      const text = '✅ Тест: Telegram-оповещения работают.';
      const r = await tgSend(text, chatId ? [chatId] : undefined);
      const ok = r.ok;
      const message = ok
        ? `Отправлено: ${(r as { sent?: number }).sent || 1}`
        : (r as { reason?: string }).reason || 'Не отправлено';
      voidLogUserAction({
        userId: actor.actorId,
        userEmail: actor.actorEmail,
        action: 'BOTS_TEST',
        category: 'bots',
        summary: message,
        success: ok,
        detail: { channel: 'telegram', chatId: chatId || null },
      });
      if (!ok) return NextResponse.json({ ok: false, message }, { status: 400 });
      return NextResponse.json({ ok: true, message });
    }

    if (action === 'attachMyTelegram') {
      const session = await getServerSession(authOptions);
      const uid = session?.user?.id;
      const me = uid
        ? await prisma.user.findUnique({ where: { id: uid }, select: { telegramChatId: true } })
        : null;
      if (!me?.telegramChatId) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Сначала укажите свой Telegram chat ID в профиле (Кабинет → Редактировать) и напишите боту /start',
          },
          { status: 400 }
        );
      }
      const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const set = new Set(
        (s?.telegramAlertChatIds || '')
          .split(/[\s,]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      );
      set.add(me.telegramChatId);
      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update: { telegramAlertChatIds: [...set].join(',') },
        create: { id: '1', telegramAlertChatIds: me.telegramChatId },
      });
      return NextResponse.json({
        ok: true,
        message: `Добавлен chat ID ${me.telegramChatId}`,
        ...(await buildStatus()),
      });
    }

    if (action === 'attachMyMax') {
      const session = await getServerSession(authOptions);
      const uid = session?.user?.id;
      const me = uid
        ? await prisma.user.findUnique({ where: { id: uid }, select: { maxUserId: true } })
        : null;
      if (!me?.maxUserId) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Сначала укажите свой MAX ID в профиле и напишите боту /start',
          },
          { status: 400 }
        );
      }
      const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const set = new Set(
        (s?.maxAlertChatIds || '')
          .split(/[\s,]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      );
      set.add(me.maxUserId);
      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update: { maxAlertChatIds: [...set].join(',') },
        create: { id: '1', maxAlertChatIds: me.maxUserId },
      });
      return NextResponse.json({
        ok: true,
        message: `Добавлен MAX ID ${me.maxUserId}`,
        ...(await buildStatus()),
      });
    }

    return NextResponse.json({ message: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return aclJsonError(e);
  }
}
