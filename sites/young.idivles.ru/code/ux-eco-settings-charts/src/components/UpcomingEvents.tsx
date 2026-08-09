import { prisma } from '@/lib/prisma';
import {
  Building2,
  Calendar,
  Crown,
  MapPin,
  Megaphone,
  UserRound,
} from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import JoinEventButton from './JoinEventButton';
import EventInviteFriends from './EventInviteFriends';
import EditBookingDetails from './EditBookingDetails';
import Link from 'next/link';
import { formatMskDate, formatMskTimeRange } from '@/lib/booking-hours';
import { encodeRouteParam } from '@/lib/route-id';
import EntityCoverImage from './EntityCoverImage';
import { eventCover, sectionCover } from '@/lib/theme-covers';
import { normalizeEventCategory, normalizeEventContactMode } from '@/lib/event-meta';
import EventHomeCarousel from './EventHomeCarousel';
import ViewBeacon from '@/components/ViewBeacon';

type Props = {
  spaceId?: string;
  hideTitle?: boolean;
  /** grid (default on /events) | carousel (home) */
  mode?: 'grid' | 'carousel';
  /** Limit to events starting within the next N days (weekly afisha). */
  withinDays?: number;
};

function contactHref(kind: 'phone' | 'telegram' | 'vk' | 'max', value: string) {
  const v = value.trim();
  if (!v) return null;
  if (kind === 'phone') {
    const digits = v.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'telegram') {
    const handle = v.replace(/^@/, '');
    return `https://t.me/${handle}`;
  }
  if (kind === 'vk') return v.startsWith('vk.com') ? `https://${v}` : `https://vk.com/${v.replace(/^@/, '')}`;
  return v;
}

type EventRow = Awaited<ReturnType<typeof loadEvents>>[number];

async function loadEvents(spaceId: string | undefined, withinDays: number | undefined, userId: string | undefined) {
  const startFrom = new Date();
  const endBefore =
    typeof withinDays === 'number' && withinDays > 0
      ? new Date(startFrom.getTime() + withinDays * 24 * 60 * 60 * 1000)
      : undefined;

  return prisma.booking.findMany({
    where: {
      status: 'APPROVED',
      startTime: {
        gte: startFrom,
        ...(endBefore ? { lte: endBefore } : {}),
      },
      ...(spaceId ? { spaceId } : {}),
    },
    include: {
      space: true,
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          publicCode: true,
          phone: true,
          vkUrl: true,
          telegramUrl: true,
          maxUrl: true,
        },
      },
      _count: { select: { participants: true } },
      ...(userId
        ? {
            participants: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
    orderBy: { startTime: 'asc' },
    take: 20,
  });
}

function EventCard({
  event,
  index,
  userId,
  spaceId,
  iconActions,
}: {
  event: EventRow;
  index: number;
  userId?: string;
  spaceId?: string;
  iconActions?: boolean;
}) {
  const participantsCount = event._count?.participants ?? 0;
  const availableSeats = event.space.capacity - participantsCount;
  const isFull = availableSeats <= 0;
  const isJoined = Boolean(userId && Array.isArray(event.participants) && event.participants.length > 0);
  const isOrganizer = Boolean(userId && event.userId === userId);
  const cover = eventCover(
    { title: event.title, space: { image: event.space?.image, title: event.space?.title } },
    index
  );
  const category = normalizeEventCategory(event.category);
  const contactMode = normalizeEventContactMode(event.contactMode);
  const organizerName = event.user.nickname || event.user.name || 'Организатор';
  const profileHref = event.showOrganizerProfile
    ? `/u/${event.user.publicCode || event.user.id}`
    : null;

  const contacts: { label: string; href: string }[] = [];
  if (contactMode === 'PROFILE') {
    const phone = contactHref('phone', event.user.phone || '');
    const tg = contactHref('telegram', event.user.telegramUrl || '');
    const vk = contactHref('vk', event.user.vkUrl || '');
    const max = contactHref('max', event.user.maxUrl || '');
    if (phone) contacts.push({ label: 'Телефон', href: phone });
    if (tg) contacts.push({ label: 'Telegram', href: tg });
    if (vk) contacts.push({ label: 'VK', href: vk });
    if (max) contacts.push({ label: 'MAX', href: max });
  } else if (contactMode === 'CUSTOM') {
    const phone = contactHref('phone', event.contactPhone || '');
    const tg = contactHref('telegram', event.contactTelegram || '');
    const vk = contactHref('vk', event.contactVk || '');
    const max = contactHref('max', event.contactMax || '');
    if (phone) contacts.push({ label: 'Телефон', href: phone });
    if (tg) contacts.push({ label: 'Telegram', href: tg });
    if (vk) contacts.push({ label: 'VK', href: vk });
    if (max) contacts.push({ label: 'MAX', href: max });
  }

  const desc = (event.description || '').trim();
  const primaryContact = contacts[0];

  return (
    <article key={event.id} id={`event-${event.id}`} className={`glass event-card${iconActions ? " event-card--compact" : ""}`}>
      <div className="event-card-cover">
        <EntityCoverImage
          src={cover}
          alt={event.title}
          fallback={sectionCover('events')}
          className="catalog-img"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>

      <div className="event-card-body">
        <div className="event-card-meta">
          <span className="event-card-date">
            <Calendar size={13} aria-hidden />
            {formatMskDate(event.startTime, { day: 'numeric', month: 'short' })}
          </span>
          <span className="event-card-category">{category}</span>
          <span className={`event-card-seats${isFull ? ' is-full' : ''}`}>
            {isFull ? 'Мест нет' : 'Есть места'}
          </span>
        </div>

        <h3 className="event-card-title">{event.title}</h3>
        <ViewBeacon type="EVENT" id={event.id} initialCount={event.viewCount ?? 0} />
        {desc && !iconActions ? <p className="event-card-desc">{desc}</p> : null}

        <div className={`event-card-facts${iconActions ? " event-card-facts--inline" : ""}`}>
          <div>
            <ClockIcon />
            {formatMskTimeRange(event.startTime, event.endTime)} (МСК)
          </div>
          <div>
            <MapPin size={13} aria-hidden />
            {event.space.title}
          </div>
          {profileHref ? (
            <div>
              <UserRound size={13} aria-hidden />
              <Link href={profileHref} className="event-card-org-link">
                {organizerName}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="event-card-actions event-card-actions--row">
          {isOrganizer ? (
            <span className="event-organizer-badge" title="Вы ведёте" aria-label="Вы ведёте это мероприятие">
              <Crown size={15} aria-hidden />
              <span>Вы ведёте</span>
            </span>
          ) : (
            <JoinEventButton
              eventId={event.id}
              initialIsJoined={isJoined}
              initialIsFull={isFull}
              initialAvailableSeats={availableSeats}
              title={event.title}
              startTime={event.startTime}
              endTime={event.endTime}
              location={[event.space?.title, event.space?.address].filter(Boolean).join(', ')}
              description={event.description}
              compact
            />
          )}
          {userId && (isOrganizer || isJoined) ? (
            <EventInviteFriends bookingId={event.id} eventTitle={event.title} compact />
          ) : null}
          {primaryContact ? (
            <a
              href={primaryContact.href}
              target="_blank"
              rel="noopener noreferrer"
              className="event-card-space-link"
            >
              {primaryContact.label}
            </a>
          ) : null}
          {isOrganizer ? (
            <EditBookingDetails
              compact
              booking={{
                id: event.id,
                title: event.title,
                description: event.description,
                category: event.category,
                contactMode: event.contactMode,
                contactPhone: event.contactPhone,
                contactTelegram: event.contactTelegram,
                contactVk: event.contactVk,
                contactMax: event.contactMax,
                showOrganizerProfile: event.showOrganizerProfile,
              }}
            />
          ) : null}
          {!spaceId ? (
            <Link href={`/spaces/${encodeRouteParam(event.spaceId)}`} className="event-card-space-link">
              Площадка
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function UpcomingEvents({ spaceId, hideTitle, withinDays, mode }: Props = {}) {
  const useCarousel =
    mode === 'carousel' || (Boolean(hideTitle) && mode !== 'grid' && !spaceId);
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const isStaff =
    session?.user?.role === 'ADMIN' ||
    session?.user?.role === 'MODERATOR' ||
    session?.user?.role === 'SCANNER';

  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { publicEventsVisibility: true },
  });

  if (!settings?.publicEventsVisibility && !session?.user && !isStaff) {
    if (hideTitle) {
      return (
        <div className="event-empty glass">
          <h3>Афиша доступна после входа</h3>
          <p>Войдите в аккаунт, чтобы увидеть ближайшие мероприятия.</p>
          <Link href="/login" className="btn btn-primary">
            Войти
          </Link>
        </div>
      );
    }
    return null;
  }

  const events = await loadEvents(spaceId, withinDays, userId);

  if (events.length === 0) {
    return (
      <div className="event-empty glass">
        <h3>Ближайших мероприятий пока нет</h3>
        <p>Следите за афишей — новые события появятся здесь после подтверждения бронирований.</p>
        <Link href="/spaces" className="btn btn-primary">
          Забронировать пространство
        </Link>
      </div>
    );
  }

  const cards = events.map((event, index) => (
    <EventCard
      key={event.id}
      event={event}
      index={index}
      userId={userId}
      spaceId={spaceId}
      iconActions={useCarousel}
    />
  ));

  return (
    <div className={`event-list${useCarousel ? ' is-embedded is-slideshow' : ''}${hideTitle ? ' is-embedded' : ''}`}>
      {!spaceId && !hideTitle && (
        <div className="event-list-head">
          <h2>Афиша мероприятий</h2>
          <p>Ближайшие события в молодёжных пространствах города</p>
        </div>
      )}

      {useCarousel ? (
        <EventHomeCarousel count={events.length}>
          {cards.map((card) => (
            <div key={card.key} className="event-carousel__slide">
              {card}
            </div>
          ))}
        </EventHomeCarousel>
      ) : (
        <div className="event-grid">{cards}</div>
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}
