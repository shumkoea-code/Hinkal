/**
 * Staff alerts & moderation helpers for MAX (mirrors telegram-moderation).
 */
import { prisma } from '@/lib/prisma';
import { hasPermission, isTechRole } from '@/lib/acl-shared';
import { getSiteIdentity } from '@/lib/site-identity';
import {
  maxGetConfig,
  maxSendMessage,
  maxCallbackKeyboard,
  maxLinkKeyboard,
} from '@/lib/max';

function canDo(
  u: { role: string; permissions: string | null },
  kind: 'applications' | 'bookings'
) {
  if (u.role === 'ADMIN' || isTechRole(u.role)) return true;
  return hasPermission(u.role, u.permissions, kind);
}

async function moderationEnabled(): Promise<boolean> {
  const c = await maxGetConfig();
  return !!(c.token && c.enabled);
}

/** Alert user ids from settings + staff with linked maxUserId. */
export async function getStaffMaxRecipients(
  resource: 'applications' | 'bookings'
): Promise<string[]> {
  if (!(await moderationEnabled())) return [];
  const c = await maxGetConfig();

  const staff = await prisma.user.findMany({
    where: {
      maxUserId: { not: null },
      blockedAt: null,
      deletedAt: null,
      OR: [{ role: 'ADMIN' }, { role: 'MODERATOR' }, { role: 'TECH' }],
    },
    select: {
      role: true,
      permissions: true,
      maxUserId: true,
    },
    take: 100,
  });

  const fromStaff = staff
    .filter((u) => u.maxUserId && canDo(u, resource))
    .map((u) => String(u.maxUserId));

  return Array.from(new Set([...c.ids, ...fromStaff]));
}

export async function notifyStaffMaxNewApplication(applicationId: string): Promise<void> {
  try {
    const recipients = await getStaffMaxRecipients('applications');
    if (!recipients.length) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { name: true, email: true } },
        program: { select: { title: true } },
      },
    });
    if (!app || app.status !== 'PENDING') return;

    const { publicOrigin } = await getSiteIdentity();
    const text =
      `📥 Новая заявка\n` +
      `${app.program?.title || 'Программа'}\n` +
      `👤 ${app.user?.name || '—'} (${app.user?.email || '—'})\n` +
      `${(app.message || '').slice(0, 280) || 'без сообщения'}`;

    const attachments = [
      ...maxCallbackKeyboard([
        [
          { text: '✅ Одобрить', payload: `app_ok_${app.id}` },
          { text: '✕ Отклонить', payload: `app_no_${app.id}` },
        ],
      ]),
      ...maxLinkKeyboard(
        'Открыть в админке',
        `${publicOrigin}/admin/applications?status=PENDING&focus=${app.id}`
      ),
    ];

    for (const userId of recipients) {
      await maxSendMessage({ userId }, text, { attachments });
    }
  } catch (e) {
    console.error('[max-moderation] application notify failed', e);
  }
}

export async function notifyStaffMaxNewBooking(opts: {
  bookingId: string;
  status: 'PENDING' | 'APPROVED';
}): Promise<void> {
  try {
    const recipients = await getStaffMaxRecipients('bookings');
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
        `✅ Бронь автоодобрена\n` +
        `${booking.title}\n` +
        `🏠 ${booking.space?.title || '—'}\n` +
        `👤 ${booking.user.name || '—'}`;
      const attachments = maxLinkKeyboard(
        'Брони в админке',
        `${publicOrigin}/admin/bookings?status=APPROVED`
      );
      for (const userId of recipients) {
        await maxSendMessage({ userId }, text, { attachments });
      }
      return;
    }

    if (booking.status !== 'PENDING') return;

    const text =
      `📅 Новая бронь на модерацию\n` +
      `${booking.title}\n` +
      `🏠 ${booking.space?.title || '—'}\n` +
      `👤 ${booking.user.name || '—'}`;

    const attachments = [
      ...maxCallbackKeyboard([
        [
          { text: '✅ Одобрить', payload: `book_ok_${booking.id}` },
          { text: '✕ Отклонить', payload: `book_no_${booking.id}` },
        ],
      ]),
      ...maxLinkKeyboard(
        'Открыть',
        `${publicOrigin}/admin/bookings?status=PENDING&view=${booking.id}`
      ),
    ];

    for (const userId of recipients) {
      await maxSendMessage({ userId }, text, { attachments });
    }
  } catch (e) {
    console.error('[max-moderation] booking notify failed', e);
  }
}
