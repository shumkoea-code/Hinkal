import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  maxSendMessage,
  maxGetConfig,
  maxCallbackKeyboard,
  maxLinkKeyboard,
} from '@/lib/max';
import { hasPermission, isTechRole } from '@/lib/acl-shared';
import { getSiteIdentity } from '@/lib/site-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StaffUser = {
  id: string;
  name: string | null;
  role: string;
  permissions: string | null;
};

async function resolveStaff(maxUserId?: string | number | null): Promise<StaffUser | null> {
  if (maxUserId === undefined || maxUserId === null || maxUserId === '') return null;
  const u = await prisma.user.findFirst({
    where: { maxUserId: String(maxUserId), blockedAt: null, deletedAt: null },
    select: { id: true, name: true, role: true, permissions: true },
  });
  return u || null;
}

function canDo(u: StaffUser, kind: 'applications' | 'bookings') {
  return u.role === 'ADMIN' || isTechRole(u.role) || hasPermission(u.role, u.permissions, kind);
}

function isStartCommand(text: string) {
  const t = text.trim().toLowerCase();
  return (
    /^\/start\b/i.test(text) ||
    /^\/старт\b/i.test(text) ||
    t === 'start' ||
    t === 'старт' ||
    t === '/старт'
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'max-webhook' });
}

export async function POST(req: NextRequest) {
  const c = await maxGetConfig();
  if (!c.token || !c.enabled) {
    // Still 200 so MAX does not drop subscription during brief misconfig
    return NextResponse.json({ ok: false, reason: 'disabled' });
  }

  const secret = req.headers.get('x-max-bot-api-secret') || '';
  if (c.secret && secret !== c.secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Record<string, any> = {};
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const updateType = String(update.update_type || update.type || '');
  const msg = update.message || update.message_created?.message || null;
  const cb = update.callback || update.message_callback?.callback || null;

  const senderId =
    msg?.sender?.user_id ??
    update.user_id ??
    update.user?.user_id ??
    cb?.user?.user_id ??
    cb?.from?.user_id ??
    null;

  const chatId =
    msg?.recipient?.chat_id ??
    update.chat_id ??
    cb?.message?.recipient?.chat_id ??
    null;

  const text: string = (msg?.body?.text || msg?.text || '').toString().trim();
  const payload: string = (cb?.payload || '').toString();

  const reply = async (t: string, attachments?: unknown[]) => {
    if (senderId == null && chatId == null) return { ok: false };
    return maxSendMessage(
      { userId: senderId, chatId },
      t,
      { token: c.token, attachments }
    );
  };

  // bot_started — user opened the bot / pressed Start
  if (updateType === 'bot_started' || (!text && !payload && senderId != null && update.user)) {
    const { publicOrigin, siteName } = await getSiteIdentity();
    await reply(
      `👋 ${siteName}\n\nВаш MAX ID: ${senderId}\n\n` +
        `1) Откройте профиль на сайте → поле «MAX ID»\n` +
        `2) Вставьте этот номер и сохраните\n\n` +
        `Команды: /help`,
      maxLinkKeyboard('Открыть профиль', `${publicOrigin}/dashboard`)
    );
    return NextResponse.json({ ok: true });
  }

  if (isStartCommand(text)) {
    const { publicOrigin, siteName } = await getSiteIdentity();
    await reply(
      `👋 ${siteName}\n\nВаш MAX ID: ${senderId}\nУкажите его в профиле сайта (поле «MAX ID»), чтобы получать уведомления.\n\nКоманды: /help`,
      maxLinkKeyboard('Открыть профиль', `${publicOrigin}/dashboard`)
    );
    return NextResponse.json({ ok: true });
  }

  if (/^\/(help|помощь)\b/i.test(text)) {
    await reply(
      'Команды MAX-бота:\n' +
        '/start — показать ваш MAX ID\n' +
        '/status — проверка связи\n' +
        '/id — ваш MAX ID\n' +
        '/applications — заявки на модерацию (сотрудники)\n' +
        '/bookings — брони на модерацию (сотрудники)'
    );
    return NextResponse.json({ ok: true });
  }

  if (/^\/(status|статус)\b/i.test(text)) {
    await reply('Сайт young.idivles.ru работает ✅\nMAX-бот на связи.');
    return NextResponse.json({ ok: true });
  }

  if (/^\/id\b/i.test(text)) {
    await reply(`Ваш MAX ID: ${senderId || '—'}`);
    return NextResponse.json({ ok: true });
  }

  const staff = await resolveStaff(senderId);
  const { publicOrigin } = await getSiteIdentity();

  if (/^\/(applications|заявки)\b/i.test(text)) {
    if (!staff || !canDo(staff, 'applications')) {
      await reply(
        'Недостаточно прав. Привяжите MAX ID в профиле (роль сотрудника с правом «Заявки»).'
      );
      return NextResponse.json({ ok: true });
    }
    const apps = await prisma.application.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true, message: true, user: { select: { name: true } } },
    });
    if (!apps.length) {
      await reply('Заявок на модерацию нет.');
      return NextResponse.json({ ok: true });
    }
    for (const a of apps) {
      await maxSendMessage(
        { userId: senderId, chatId },
        `Заявка ${a.id.slice(0, 8)} от ${a.user?.name || '—'}: ${a.message || 'без сообщения'}`,
        {
          token: c.token,
          attachments: maxCallbackKeyboard([
            [
              { text: '✅ Одобрить', payload: `app_ok_${a.id}` },
              { text: '✕ Отклонить', payload: `app_no_${a.id}` },
            ],
            [{ text: 'В админке', payload: `link_admin_app_${a.id}` }],
          ]),
        }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (/^\/(bookings|брони)\b/i.test(text)) {
    if (!staff || !canDo(staff, 'bookings')) {
      await reply('Недостаточно прав для броней.');
      return NextResponse.json({ ok: true });
    }
    const books = await prisma.booking.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        user: { select: { name: true } },
        space: { select: { title: true } },
      },
    });
    if (!books.length) {
      await reply('Броней на модерацию нет.');
      return NextResponse.json({ ok: true });
    }
    for (const b of books) {
      await maxSendMessage(
        { userId: senderId, chatId },
        `Бронь ${b.id.slice(0, 8)} «${b.title}»\n${b.space?.title || '—'} · ${b.user?.name || '—'}`,
        {
          token: c.token,
          attachments: maxCallbackKeyboard([
            [
              { text: '✅ Одобрить', payload: `book_ok_${b.id}` },
              { text: '✕ Отклонить', payload: `book_no_${b.id}` },
            ],
          ]),
        }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Callback / command: (app|book)_(ok|no)_<id>
  const cmd = payload || text;
  const linkAdmin = cmd.match(/^link_admin_app_([A-Za-z0-9_-]+)$/);
  if (linkAdmin) {
    await reply(`Админка: ${publicOrigin}/admin/applications?status=PENDING&focus=${linkAdmin[1]}`);
    return NextResponse.json({ ok: true });
  }

  const m = cmd.match(/^\/?(app|book)_(ok|no)_([A-Za-z0-9_-]+)$/);
  if (m) {
    if (!staff) {
      await reply('Сначала привяжите MAX ID в профиле.');
      return NextResponse.json({ ok: true });
    }
    const kind = m[1];
    const status = m[2] === 'ok' ? 'APPROVED' : 'REJECTED';
    const id = m[3];
    const perm = kind === 'app' ? 'applications' : 'bookings';
    if (!canDo(staff, perm)) {
      await reply('Недостаточно прав для этого действия.');
      return NextResponse.json({ ok: true });
    }
    try {
      if (kind === 'app') {
        const row = await prisma.application.update({
          where: { id },
          data: { status },
          include: { user: { select: { id: true } } },
        });
        try {
          const { createUserNotification } = await import('@/lib/security');
          await createUserNotification({
            userId: row.user.id,
            type: 'APPLICATION',
            title: status === 'APPROVED' ? 'Заявка одобрена' : 'Заявка отклонена',
            body: 'Статус изменён через MAX-бота',
            meta: { href: '/dashboard' },
          });
        } catch {
          /* optional */
        }
        await reply(`Заявка ${id.slice(0, 8)} → ${status}.`);
      } else {
        const row = await prisma.booking.update({
          where: { id },
          data: { status },
          include: { user: { select: { id: true } } },
        });
        try {
          const { createUserNotification } = await import('@/lib/security');
          await createUserNotification({
            userId: row.user.id,
            type: 'BOOKING',
            title: status === 'APPROVED' ? 'Бронь одобрена' : 'Бронь отклонена',
            body: 'Статус изменён через MAX-бота',
            meta: { href: '/dashboard' },
          });
        } catch {
          /* optional */
        }
        await reply(`Бронь ${id.slice(0, 8)} → ${status}.`);
      }
    } catch {
      await reply('Не найдено или уже обработано.');
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
