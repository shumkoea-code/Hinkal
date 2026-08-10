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
import { getTelegramConfig, tgSend, tgSetWebhook } from '@/lib/telegram';

const DEFAULT_MAX_TYPES = ['message_created', 'message_callback', 'bot_started'];

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

async function buildStatus() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
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

  // Типы событий задаются при регистрации вебхука; в UI — дефолтный набор.
  const updateTypes = DEFAULT_MAX_TYPES;

  const tg = await getTelegramConfig();

  const [maxUsers, tgUsers] = await Promise.all([
    prisma.user.findMany({
      where: { maxUserId: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        publicCode: true,
        maxUserId: true,
      },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        publicCode: true,
        telegramChatId: true,
      },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return {
    max: {
      enabled: maxCfg.enabled,
      hasToken: Boolean(maxCfg.token),
      hasSecret: Boolean(maxCfg.secret),
      alertIds: maxCfg.ids,
      me: me?.ok ? me.json : { error: me?.text },
      subscriptions: subs?.ok ? subs.json : { error: subs?.text },
      apiBase: process.env.MAX_API_BASE || 'https://platform-api2.max.ru',
      certOk,
      certHint,
      updateTypes,
    },
    telegram: {
      enabled: tg.enabled,
      hasToken: Boolean(tg.token),
      alertIds: tg.ids,
      dailyBackupEnabled: Boolean((settings as { dailyBackupEnabled?: boolean } | null)?.dailyBackupEnabled),
      dailyBackupChatId: (settings as { dailyBackupChatId?: string | null } | null)?.dailyBackupChatId || null,
      dailyBackupHour: (settings as { dailyBackupHour?: number | null } | null)?.dailyBackupHour ?? 3,
      webhookUrl: '/api/integrations/telegram/webhook',
    },
    linked: {
      max: maxUsers.filter((u) => u.maxUserId),
      telegram: tgUsers.filter((u) => u.telegramChatId),
    },
    publicSiteUrl: (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl || process.env.NEXTAUTH_URL || null,
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
      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update,
        create: { id: '1', ...update },
      });
      return NextResponse.json({ message: 'Сохранено', ...(await buildStatus()) });
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
      await prisma.siteSettings.upsert({
        where: { id: '1' },
        update,
        create: { id: '1', ...update },
      });
      return NextResponse.json({ message: 'Сохранено', ...(await buildStatus()) });
    }

    if (action === 'ensureMaxWebhook') {
      await maxEnsureWebhookSecret();
      const types = Array.isArray(body.updateTypes)
        ? (body.updateTypes as unknown[]).map(String).filter(Boolean)
        : undefined;
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
      return NextResponse.json({ ok: true, message: 'Вебхук MAX зарегистрирован' });
    }

    if (action === 'ensureTelegramWebhook') {
      const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
      const base = (
        (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl ||
        process.env.NEXTAUTH_URL ||
        'https://young.idivles.ru'
      ).replace(/\/$/, '');
      const r = await tgSetWebhook(`${base}/api/integrations/telegram/webhook`);
      if (!r.ok) {
        return NextResponse.json(
          {
            ok: false,
            message:
              (r.json as { description?: string } | null)?.description || 'Не удалось зарегистрировать вебхук',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, message: 'Вебхук Telegram зарегистрирован' });
    }

    if (action === 'testMax') {
      const userId = String(body.userId || '').replace(/[^0-9]/g, '');
      const text = '✅ Тест MAX с young.idivles.ru';
      if (userId) {
        const r = await maxSendMessage({ userId }, text);
        if (!r.ok) {
          return NextResponse.json(
            { ok: false, message: r.reason || 'Не отправлено' },
            { status: 400 }
          );
        }
        return NextResponse.json({ ok: true, message: `Отправлено user_id ${userId}` });
      }
      const r = await maxSend(text);
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, message: r.reason || r.errors?.[0] || 'Не отправлено' },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, message: `Отправлено: ${r.sent}/${r.total}` });
    }

    if (action === 'testTelegram') {
      const chatId = String(body.chatId || '').replace(/[^0-9-]/g, '');
      const text = '✅ Тест: Telegram-оповещения работают.';
      const r = await tgSend(text, chatId ? [chatId] : undefined);
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, message: (r as { reason?: string }).reason || 'Не отправлено' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: `Отправлено: ${(r as { sent?: number }).sent || 1}`,
      });
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

    return NextResponse.json({ message: 'Неизвестное действие' }, { status: 400 });
  } catch (e) {
    return aclJsonError(e);
  }
}
