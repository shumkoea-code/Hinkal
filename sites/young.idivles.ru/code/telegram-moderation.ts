import { prisma } from '@/lib/prisma';
import { hasPermission, isTechRole } from '@/lib/acl-shared';
import { formatMskDateTime, formatMskTimeRange } from '@/lib/booking-hours';
import { getSiteIdentity } from '@/lib/site-identity';
import { notifyApplicationStatus, notifyBookingStatus } from '@/lib/notifications';
import { promoteToParticipant } from '@/lib/participant';
import {
  decisionKeyboard,
  getTelegramConfig,
  openAdminKeyboard,
  tgEditMessage,
  tgSendMessage,
} from '@/lib/telegram';

type StaffUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: string | null;
  telegramChatId: string | null;
};

function canDo(u: Pick<StaffUser, 'role' | 'permissions'>, kind: 'applications' | 'bookings') {
  if (u.role === 'ADMIN' || isTechRole(u.role)) return true;
  return hasPermission(u.role, u.permissions, kind);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function moderationEnabled(): Promise<boolean> {
  const c = await getTelegramConfig();
  return !!(c.token && c.enabled);
}

/** Alert chat ids + staff with linked Telegram and matching permission. */
export async function getStaffTelegramRecipients(
  resource: 'applications' | 'bookings'
): Promise<string[]> {
  if (!(await moderationEnabled())) return [];
  const c = await getTelegramConfig();

  const staff = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      blockedAt: null,
      deletedAt: null,
      OR: [{ role: 'ADMIN' }, { role: 'MODERATOR' }, { role: 'TECH' }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      telegramChatId: true,
    },
    take: 100,
  });

  const fromStaff = staff
    .filter((u) => u.telegramChatId && canDo(u, resource))
    .map((u) => String(u.telegramChatId));

  return Array.from(new Set([...c.ids, ...fromStaff]));
}

async function resolveActor(chatId: string | number, resource: 'applications' | 'bookings') {
  const chat = String(chatId);
  const linked = await prisma.user.findFirst({
    where: {
      telegramChatId: chat,
      blockedAt: null,
      deletedAt: null,
      OR: [{ role: 'ADMIN' }, { role: 'MODERATOR' }, { role: 'TECH' }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      telegramChatId: true,
    },
  });
  if (linked && canDo(linked, resource)) return linked;

  const recipients = await getStaffTelegramRecipients(resource);
  if (!recipients.includes(chat)) return null;

  // Alert chat without personal binding → act as first ADMIN
  return prisma.user.findFirst({
    where: { role: 'ADMIN', blockedAt: null, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      telegramChatId: true,
    },
  });
}

function applicationCard(app: {
  id: string;
  status: string;
  message: string | null;
  createdAt: Date;
  user: { name: string | null; phone: string | null; email: string | null };
  project: { title: string } | null;
  club: { title: string } | null;
  program: { title: string } | null;
}): string {
  const target =
    app.project?.title || app.club?.title || app.program?.title || 'Без цели';
  const kind = app.project ? 'Проект' : app.club ? 'Клуб' : app.program ? 'Программа' : 'Заявка';
  return [
    '📋 <b>Новая заявка</b>',
    '',
    `<b>${escapeHtml(target)}</b> · ${kind}`,
    `👤 ${escapeHtml(app.user.name || '—')}`,
    app.user.phone ? `📞 ${escapeHtml(app.user.phone)}` : null,
    app.user.email ? `✉️ ${escapeHtml(app.user.email)}` : null,
    app.message ? `💬 ${escapeHtml(app.message.slice(0, 400))}` : null,
    '',
    `Статус: <b>${app.status}</b>`,
    `⏱ ${escapeHtml(formatMskDateTime(app.createdAt))}`,
    `<code>${app.id}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function bookingCard(booking: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startTime: Date;
  endTime: Date;
  user: { name: string | null; phone: string | null; email: string | null };
  space: { title: string; address: string | null } | null;
}): string {
  const when = `${formatMskDateTime(booking.startTime)} · ${formatMskTimeRange(
    booking.startTime,
    booking.endTime
  )}`;
  return [
    '📅 <b>Новая бронь на согласование</b>',
    '',
    `<b>${escapeHtml(booking.title)}</b>`,
    `🏠 ${escapeHtml(booking.space?.title || 'Площадка')}`,
    booking.space?.address ? `📍 ${escapeHtml(booking.space.address)}` : null,
    `📆 ${escapeHtml(when)}`,
    `👤 ${escapeHtml(booking.user.name || '—')}`,
    booking.user.phone ? `📞 ${escapeHtml(booking.user.phone)}` : null,
    booking.description ? `💬 ${escapeHtml(booking.description.slice(0, 300))}` : null,
    '',
    `Статус: <b>${booking.status}</b>`,
    `<code>${booking.id}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function notifyStaffTelegramNewApplication(applicationId: string): Promise<void> {
  try {
    const recipients = await getStaffTelegramRecipients('applications');
    if (!recipients.length) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        project: { select: { title: true } },
        club: { select: { title: true } },
        program: { select: { title: true } },
      },
    });
    if (!app || app.status !== 'PENDING') return;

    const { publicOrigin } = await getSiteIdentity();
    const text = applicationCard(app);
    const keyboard = {
      inline_keyboard: [
        ...decisionKeyboard('app', app.id).inline_keyboard,
        ...openAdminKeyboard(`/admin/applications?status=PENDING&focus=${app.id}`, publicOrigin)
          .inline_keyboard,
      ],
    };

    for (const chatId of recipients) {
      await tgSendMessage(chatId, text, { reply_markup: keyboard });
    }
  } catch (e) {
    console.error('[telegram-moderation] application notify failed', e);
  }
}

export async function notifyStaffTelegramNewBooking(opts: {
  bookingId: string;
  status: 'PENDING' | 'APPROVED';
}): Promise<void> {
  try {
    const recipients = await getStaffTelegramRecipients('bookings');
    if (!recipients.length) return;

    const booking = await prisma.booking.findUnique({
      where: { id: opts.bookingId },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        space: { select: { title: true, address: true } },
      },
    });
    if (!booking) return;

    const { publicOrigin } = await getSiteIdentity();

    if (opts.status === 'APPROVED') {
      const text =
        `✅ <b>Бронь автоодобрена</b>\n\n` +
        `<b>${escapeHtml(booking.title)}</b>\n` +
        `🏠 ${escapeHtml(booking.space?.title || '—')}\n` +
        `👤 ${escapeHtml(booking.user.name || '—')}`;
      const keyboard = openAdminKeyboard(`/admin/bookings?status=APPROVED`, publicOrigin);
      for (const chatId of recipients) {
        await tgSendMessage(chatId, text, { reply_markup: keyboard });
      }
      return;
    }

    if (booking.status !== 'PENDING') return;

    const text = bookingCard(booking);
    const keyboard = {
      inline_keyboard: [
        ...decisionKeyboard('book', booking.id).inline_keyboard,
        ...openAdminKeyboard(`/admin/bookings?status=PENDING&view=${booking.id}`, publicOrigin)
          .inline_keyboard,
      ],
    };
    for (const chatId of recipients) {
      await tgSendMessage(chatId, text, { reply_markup: keyboard });
    }
  } catch (e) {
    console.error('[telegram-moderation] booking notify failed', e);
  }
}

export async function applyTelegramDecision(opts: {
  kind: 'app' | 'book';
  id: string;
  approve: boolean;
  chatId: string | number;
  messageId?: number;
  actorChatId?: string | number;
}): Promise<{ ok: boolean; message: string }> {
  if (!(await moderationEnabled())) {
    return { ok: false, message: 'Telegram-оповещения выключены' };
  }

  const resource = opts.kind === 'app' ? 'applications' : 'bookings';
  const actor = await resolveActor(opts.actorChatId ?? opts.chatId, resource);
  if (!actor) {
    return { ok: false, message: 'Нет доступа. Привяжите Telegram в профиле или добавьте chat id в оповещения.' };
  }

  const status = opts.approve ? 'APPROVED' : 'REJECTED';
  const rejectReason = opts.approve ? null : 'Отклонено через Telegram-бота';
  const { publicOrigin } = await getSiteIdentity();
  const by = actor.name || actor.email || 'модератор';

  try {
    if (opts.kind === 'app') {
      const application = await prisma.$transaction(async (tx) => {
        const current = await tx.application.findUnique({
          where: { id: opts.id },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            project: { select: { title: true } },
            club: { select: { title: true } },
            program: { select: { title: true } },
          },
        });
        if (!current) return { error: 'NOT_FOUND' as const };
        if (current.status !== 'PENDING') return { error: 'ALREADY' as const, status: current.status, current };
        const updated = await tx.application.update({
          where: { id: opts.id, status: 'PENDING' },
          data: { status, rejectReason },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            project: { select: { title: true } },
            club: { select: { title: true } },
            program: { select: { title: true } },
          },
        });
        return { error: null, updated };
      });

      if ('error' in application && application.error === 'NOT_FOUND') {
        return { ok: false, message: 'Заявка не найдена' };
      }
      if ('error' in application && application.error === 'ALREADY') {
        return { ok: false, message: `Уже обработано: ${application.status}` };
      }
      const updated = application.updated!;

      if (status === 'APPROVED') {
        await promoteToParticipant(updated.userId || updated.user.id);
      }
      if (updated.user?.email) {
        const targetName =
          updated.project?.title || updated.club?.title || updated.program?.title || 'Программа';
        void notifyApplicationStatus({
          to: updated.user.email,
          userId: updated.user.id,
          targetName,
          status,
          rejectReason: updated.rejectReason,
        }).catch(() => null);
      }

      const verb = status === 'APPROVED' ? '✅ Одобрено' : '❌ Отклонено';
      const stamp = `\n\n${verb} · ${escapeHtml(by)} · ${escapeHtml(formatMskDateTime(new Date()))}`;
      if (opts.messageId) {
        await tgEditMessage(String(opts.chatId), opts.messageId, applicationCard(updated) + stamp, {
          reply_markup: openAdminKeyboard('/admin/applications', publicOrigin),
        });
      }
      return { ok: true, message: verb };
    }

    const bookingResult = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id: opts.id },
        include: {
          space: { select: { title: true, address: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
      if (!current) return { error: 'NOT_FOUND' as const };
      if (current.status !== 'PENDING') return { error: 'ALREADY' as const, status: current.status };

      if (status === 'APPROVED') {
        const overlap = await tx.booking.findFirst({
          where: {
            spaceId: current.spaceId,
            status: 'APPROVED',
            id: { not: current.id },
            startTime: { lt: current.endTime },
            endTime: { gt: current.startTime },
          },
        });
        if (overlap) return { error: 'OVERBOOK' as const };
      }

      const updated = await tx.booking.update({
        where: { id: opts.id, status: 'PENDING' },
        data: { status, rejectReason },
        include: {
          space: { select: { title: true, address: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
      return { error: null, updated };
    });

    if (bookingResult.error === 'NOT_FOUND') return { ok: false, message: 'Бронь не найдена' };
    if (bookingResult.error === 'ALREADY') {
      return { ok: false, message: `Уже обработано: ${bookingResult.status}` };
    }
    if (bookingResult.error === 'OVERBOOK') {
      return { ok: false, message: 'Конфликт по времени с другой одобренной бронью' };
    }

    const updated = bookingResult.updated!;
    if (status === 'APPROVED') {
      await promoteToParticipant(updated.userId || updated.user.id);
    }
    if (updated.user?.email) {
      void notifyBookingStatus({
        to: updated.user.email,
        bookingId: updated.id,
        title: updated.title,
        spaceTitle: updated.space?.title,
        spaceAddress: updated.space?.address,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status,
        rejectReason: updated.rejectReason,
      }).catch(() => null);
    }

    const verb = status === 'APPROVED' ? '✅ Подтверждено' : '❌ Отклонено';
    const stamp = `\n\n${verb} · ${escapeHtml(by)} · ${escapeHtml(formatMskDateTime(new Date()))}`;
    if (opts.messageId) {
      await tgEditMessage(String(opts.chatId), opts.messageId, bookingCard(updated) + stamp, {
        reply_markup: openAdminKeyboard('/admin/bookings', publicOrigin),
      });
    }
    return { ok: true, message: verb };
  } catch (e) {
    console.error('[telegram-moderation] decision failed', e);
    return { ok: false, message: 'Ошибка обработки' };
  }
}

export async function sendPendingQueue(chatId: string | number): Promise<void> {
  const chat = String(chatId);
  const canApps = (await getStaffTelegramRecipients('applications')).includes(chat);
  const canBooks = (await getStaffTelegramRecipients('bookings')).includes(chat);
  if (!canApps && !canBooks) {
    await tgSendMessage(
      chat,
      'Нет доступа к очереди. Напишите /start, укажите chat ID в профиле сотрудника или добавьте его в «Оповещения».'
    );
    return;
  }

  const { publicOrigin } = await getSiteIdentity();
  const [apps, bookings] = await Promise.all([
    canApps
      ? prisma.application.findMany({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: 10,
          include: {
            user: { select: { name: true, phone: true, email: true } },
            project: { select: { title: true } },
            club: { select: { title: true } },
            program: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
    canBooks
      ? prisma.booking.findMany({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: 10,
          include: {
            user: { select: { name: true, phone: true, email: true } },
            space: { select: { title: true, address: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  if (!apps.length && !bookings.length) {
    await tgSendMessage(chat, '✅ Очередь пуста — нет заявок и броней на согласовании.', {
      reply_markup: openAdminKeyboard('/admin', publicOrigin),
    });
    return;
  }

  await tgSendMessage(
    chat,
    `📬 <b>Очередь согласования</b>\nЗаявки: ${apps.length} · Брони: ${bookings.length}\nНиже карточки с кнопками.`
  );

  for (const app of apps) {
    await tgSendMessage(chat, applicationCard(app), {
      reply_markup: {
        inline_keyboard: [
          ...decisionKeyboard('app', app.id).inline_keyboard,
          ...openAdminKeyboard(`/admin/applications?status=PENDING&focus=${app.id}`, publicOrigin)
            .inline_keyboard,
        ],
      },
    });
  }
  for (const booking of bookings) {
    await tgSendMessage(chat, bookingCard(booking), {
      reply_markup: {
        inline_keyboard: [
          ...decisionKeyboard('book', booking.id).inline_keyboard,
          ...openAdminKeyboard(`/admin/bookings?status=PENDING&view=${booking.id}`, publicOrigin)
            .inline_keyboard,
        ],
      },
    });
  }
}
