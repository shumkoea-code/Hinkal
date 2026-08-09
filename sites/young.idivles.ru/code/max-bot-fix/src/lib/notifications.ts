import { sendEmail, type EmailAttachment } from '@/lib/email';
import { buildEventIcs } from '@/lib/ics';
import { prisma } from '@/lib/prisma';
import { formatMskDateTime } from '@/lib/booking-hours';
import { getSiteIdentity } from '@/lib/site-identity';
import { createUserNotification } from '@/lib/security';
import { parsePermissions } from '@/lib/acl-shared';

async function shell(title: string, body: string) {
  const { siteName, publicOrigin } = await getSiteIdentity();
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:1.5rem;background:#f8fafc;border-radius:12px;color:#0f172a">
  <h1 style="font-size:1.25rem;margin:0 0 1rem;color:#2563eb">${title}</h1>
  ${body}
  <p style="margin-top:1.5rem;font-size:0.85rem;color:#64748b">${siteName} · <a href="${publicOrigin}">${publicOrigin}</a></p>
</div>`;
}

function whenMsk(startTime: Date) {
  return `${formatMskDateTime(startTime)} (МСК)`;
}

export async function notifyBookingStatus(opts: {
  to: string;
  bookingId: string;
  title: string;
  spaceTitle?: string | null;
  spaceAddress?: string | null;
  startTime: Date;
  endTime: Date;
  status: 'APPROVED' | 'REJECTED';
  rejectReason?: string | null;
}) {
  const { publicOrigin, host } = await getSiteIdentity();
  const when = whenMsk(opts.startTime);
  const approved = opts.status === 'APPROVED';
  const subject = approved
    ? `Бронь одобрена: ${opts.title}`
    : `Бронь отклонена: ${opts.title}`;
  const reasonHtml =
    !approved && opts.rejectReason
      ? `<p><b>Причина:</b> ${opts.rejectReason.replace(/</g, '&lt;')}</p>`
      : '';
  const html = await shell(
    approved ? 'Бронь одобрена' : 'Бронь отклонена',
    `<p>Мероприятие <b>${opts.title}</b> на площадке «${opts.spaceTitle || 'Пространство'}» (${when}) ${approved ? 'одобрено' : 'отклонено'}.</p>
     ${opts.spaceAddress ? `<p>Адрес: ${opts.spaceAddress}</p>` : ''}
     ${reasonHtml}
     <p><a href="${publicOrigin}/dashboard">Открыть личный кабинет</a></p>`
  );

  const attachments: EmailAttachment[] = [];
  if (approved) {
    attachments.push({
      filename: 'event.ics',
      content: buildEventIcs({
        uid: opts.bookingId,
        uidHost: host,
        title: opts.title,
        description: `Мероприятие на площадке ${opts.spaceTitle || ''}`,
        location: [opts.spaceTitle, opts.spaceAddress].filter(Boolean).join(', '),
        start: opts.startTime,
        end: opts.endTime,
        url: `${publicOrigin}/dashboard`,
      }),
      contentType: 'text/calendar; charset=utf-8',
    });
  }

  return sendEmail(opts.to, subject, html, { attachments });
}

/** In-app + email alerts for admins / moderators with bookings permission. */
export async function notifyStaffNewBooking(opts: {
  bookingId: string;
  title: string;
  description?: string | null;
  spaceTitle?: string | null;
  spaceAddress?: string | null;
  startTime: Date;
  endTime: Date;
  status: 'PENDING' | 'APPROVED';
  organizerName?: string | null;
  organizerEmail?: string | null;
}) {
  const { publicOrigin } = await getSiteIdentity();
  const when = whenMsk(opts.startTime);
  const pending = opts.status === 'PENDING';
  const notifTitle = pending ? 'Новая бронь на согласование' : 'Новая бронь (автоодобрена)';
  const who = opts.organizerName || opts.organizerEmail || 'Пользователь';
  const notifBody = `${who} · «${opts.title}» · ${opts.spaceTitle || 'Площадка'} · ${when}`;

  const candidates = await prisma.user.findMany({
    where: {
      OR: [{ role: 'ADMIN' }, { role: 'MODERATOR' }],
      blockedAt: null,
    },
    select: { id: true, email: true, role: true, permissions: true },
    take: 80,
  });

  const staff = candidates.filter((u) => {
    if (u.role === 'ADMIN') return true;
    return parsePermissions(u.permissions).includes('bookings');
  });

  await Promise.all(
    staff.map((s) =>
      createUserNotification({
        userId: s.id,
        type: 'BOOKING_REQUEST',
        title: notifTitle,
        body: notifBody,
        meta: { bookingId: opts.bookingId, status: opts.status, href: '/admin/bookings' },
      })
    )
  );

  const emailTargets = new Set(
    staff.map((s) => (s.email || '').trim().toLowerCase()).filter(Boolean)
  );

  // Fallback: site contact inbox if nobody on staff has email
  if (emailTargets.size === 0) {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { contactEmail: true, supportEmail: true },
    });
    for (const e of [settings?.supportEmail, settings?.contactEmail]) {
      const v = (e || '').trim().toLowerCase();
      if (v) emailTargets.add(v);
    }
  }

  if (emailTargets.size === 0) return { emailed: 0, notified: staff.length };

  const subject = pending
    ? `Бронь ожидает: ${opts.title}`
    : `Новая бронь: ${opts.title}`;
  const html = await shell(
    notifTitle,
    `<p><b>${who}</b> оставил(а) бронь «${opts.title}».</p>
     <p>Площадка: ${opts.spaceTitle || '—'}<br/>Когда: ${when}</p>
     ${opts.spaceAddress ? `<p>Адрес: ${opts.spaceAddress}</p>` : ''}
     ${opts.description ? `<p>${String(opts.description).slice(0, 400)}</p>` : ''}
     <p>Статус: <b>${pending ? 'ожидает согласования' : 'одобрена автоматически'}</b></p>
     <p><a href="${publicOrigin}/admin/bookings">Открыть афишу в админке</a></p>`
  );

  const results = await Promise.all(
    [...emailTargets].map((to) => sendEmail(to, subject, html).catch(() => null))
  );
  const emailed = results.filter((r) => r && (r as { success?: boolean }).success).length;

  // Telegram moderation cards (approve/reject buttons for PENDING)
  try {
    const { notifyStaffTelegramNewBooking } = await import("@/lib/telegram-moderation");
    await notifyStaffTelegramNewBooking({
      bookingId: opts.bookingId,
      status: opts.status,
    });
  } catch (e) {
    console.warn("notifyStaffTelegramNewBooking", e);
  }

  try {
    const { notifyStaffMaxNewBooking } = await import("@/lib/max-moderation");
    await notifyStaffMaxNewBooking({
      bookingId: opts.bookingId,
      status: opts.status,
    });
  } catch (e) {
    console.warn("notifyStaffMaxNewBooking", e);
  }

  return { emailed, notified: staff.length };
}

export async function notifyApplicationStatus(opts: {
  to: string;
  userId?: string;
  targetName: string;
  status: 'APPROVED' | 'REJECTED';
  rejectReason?: string | null;
}) {
  const { publicOrigin } = await getSiteIdentity();
  const approved = opts.status === 'APPROVED';
  const subject = approved
    ? `Заявка одобрена: ${opts.targetName}`
    : `Заявка отклонена: ${opts.targetName}`;
  const reasonHtml =
    !approved && opts.rejectReason
      ? `<p><b>Причина:</b> ${opts.rejectReason.replace(/</g, '&lt;')}</p>`
      : '';
  const html = await shell(
    approved ? 'Заявка одобрена' : 'Заявка отклонена',
    `<p>Ваша заявка на участие в «${opts.targetName}» ${approved ? 'одобрена' : 'отклонена'}.</p>
     ${reasonHtml}
     <p><a href="${publicOrigin}/dashboard">Личный кабинет</a></p>`
  );

  if (opts.userId) {
    const notifBody = approved
      ? `Ваша заявка на «${opts.targetName}» одобрена`
      : `Заявка на «${opts.targetName}» отклонена${opts.rejectReason ? `: ${opts.rejectReason.slice(0, 120)}` : ''}`;
    void createUserNotification({
      userId: opts.userId,
      type: 'APPLICATION',
      title: approved ? 'Заявка одобрена' : 'Заявка отклонена',
      body: notifBody,
      meta: { href: '/dashboard?tab=applications', status: opts.status, targetName: opts.targetName },
    }).catch(() => null);
  }

  return sendEmail(opts.to, subject, html);
}

export async function notifyEventJoined(opts: {
  to: string;
  bookingId: string;
  title: string;
  spaceTitle?: string | null;
  spaceAddress?: string | null;
  startTime: Date;
  endTime: Date;
}) {
  const { publicOrigin, host } = await getSiteIdentity();
  const when = whenMsk(opts.startTime);
  const html = await shell(
    'Вы записались на мероприятие',
    `<p>Вы идёте на <b>${opts.title}</b> (${when}), площадка «${opts.spaceTitle || ''}».</p>
     ${opts.spaceAddress ? `<p>Адрес: ${opts.spaceAddress}</p>` : ''}
     <p>QR-билет будет в <a href="${publicOrigin}/dashboard">личном кабинете</a>.</p>`
  );
  const attachments: EmailAttachment[] = [
    {
      filename: 'event.ics',
      content: buildEventIcs({
        uid: `${opts.bookingId}-join`,
        uidHost: host,
        title: opts.title,
        location: [opts.spaceTitle, opts.spaceAddress].filter(Boolean).join(', '),
        start: opts.startTime,
        end: opts.endTime,
        url: `${publicOrigin}/dashboard`,
      }),
      contentType: 'text/calendar; charset=utf-8',
    },
  ];
  return sendEmail(opts.to, `Вы записались: ${opts.title}`, html, { attachments });
}

export async function notifyWaitlisted(opts: {
  to: string;
  title: string;
  startTime: Date;
}) {
  const when = whenMsk(opts.startTime);
  return sendEmail(
    opts.to,
    `Лист ожидания: ${opts.title}`,
    await shell(
      'Вы в листе ожидания',
      `<p>Мест на «${opts.title}» (${when}) сейчас нет. Мы сообщим, если место освободится.</p>`
    )
  );
}

export async function notifyWaitlistPromoted(opts: {
  to: string;
  bookingId: string;
  title: string;
  spaceTitle?: string | null;
  spaceAddress?: string | null;
  startTime: Date;
  endTime: Date;
}) {
  const { publicOrigin, host } = await getSiteIdentity();
  const when = whenMsk(opts.startTime);
  const html = await shell(
    'Место освободилось',
    `<p>Освободилось место на «${opts.title}» (${when}). Вы автоматически записаны с листа ожидания.</p>
     <p>Площадка: ${opts.spaceTitle || '—'}${opts.spaceAddress ? `, ${opts.spaceAddress}` : ''}</p>
     <p><a href="${publicOrigin}/dashboard">Открыть QR-билет</a></p>`
  );
  return sendEmail(opts.to, `Место освободилось: ${opts.title}`, html, {
    attachments: [
      {
        filename: 'event.ics',
        content: buildEventIcs({
          uid: `${opts.bookingId}-promoted`,
          uidHost: host,
          title: opts.title,
          location: [opts.spaceTitle, opts.spaceAddress].filter(Boolean).join(', '),
          start: opts.startTime,
          end: opts.endTime,
          url: `${publicOrigin}/dashboard`,
        }),
        contentType: 'text/calendar; charset=utf-8',
      },
    ],
  });
}

export async function notifyEventReminder(opts: {
  to: string;
  bookingId: string;
  title: string;
  spaceTitle?: string | null;
  spaceAddress?: string | null;
  startTime: Date;
  endTime: Date;
}) {
  const { publicOrigin, host } = await getSiteIdentity();
  const when = whenMsk(opts.startTime);
  const html = await shell(
    'Напоминание о мероприятии',
    `<p>Скоро начнётся <b>${opts.title}</b> (${when}).</p>
     <p>Площадка: ${opts.spaceTitle || '—'}${opts.spaceAddress ? `, ${opts.spaceAddress}` : ''}</p>
     <p><a href="${publicOrigin}/dashboard">QR-билет в кабинете</a></p>`
  );
  return sendEmail(opts.to, `Напоминание: ${opts.title}`, html, {
    attachments: [
      {
        filename: 'event.ics',
        content: buildEventIcs({
          uid: `${opts.bookingId}-reminder`,
          uidHost: host,
          title: opts.title,
          location: [opts.spaceTitle, opts.spaceAddress].filter(Boolean).join(', '),
          start: opts.startTime,
          end: opts.endTime,
          url: `${publicOrigin}/dashboard`,
        }),
        contentType: 'text/calendar; charset=utf-8',
      },
    ],
  });
}

/** Promote first waitlisted user into participants if capacity allows */
export async function promoteFromWaitlist(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      space: true,
      _count: { select: { participants: true } },
      waitlist: { orderBy: { createdAt: 'asc' }, take: 1, include: { user: true } },
    },
  });
  if (!booking || booking.status !== 'APPROVED') return null;
  const capacity = booking.space?.capacity || 0;
  if (booking._count.participants >= capacity) return null;
  const next = booking.waitlist[0];
  if (!next) return null;

  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.bookingParticipant.count({ where: { bookingId } });
      if (count >= capacity) throw new Error('FULL');
      await tx.bookingParticipant.create({
        data: { bookingId, userId: next.userId },
      });
      await tx.bookingWaitlist.delete({ where: { id: next.id } });
    });
  } catch {
    return null;
  }

  if (next.user.email) {
    await notifyWaitlistPromoted({
      to: next.user.email,
      bookingId,
      title: booking.title,
      spaceTitle: booking.space?.title,
      spaceAddress: booking.space?.address,
      startTime: booking.startTime,
      endTime: booking.endTime,
    }).catch(() => null);
  }
  return next.userId;
}
