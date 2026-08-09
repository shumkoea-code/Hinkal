import { requireModulePage } from '@/lib/require-module-page';
import UpcomingEvents from '@/components/UpcomingEvents';
import GlobalCalendar from '@/components/GlobalCalendar';
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { getSiteIdentity, identityFromSettings } from '@/lib/site-identity';
import { brandedMetadata } from '@/lib/branded-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const { siteName, publicOrigin } = await getSiteIdentity();
  return brandedMetadata('Афиша мероприятий', {
    description: `Календарь мероприятий — ${siteName}. Запись на события и бронирование площадок.`,
    openGraph: {
      title: `Афиша мероприятий | ${siteName}`,
      description: `Календарь мероприятий — ${siteName}`,
      url: `${publicOrigin}/events`,
    },
  });
}

export const revalidate = 60;

export default async function EventsPage() {
  await requireModulePage('events');

  const session = await getServerSession(authOptions);
  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: {
      publicEventsVisibility: true,
      siteName: true,
      publicSiteUrl: true,
    },
  });
  const identity = identityFromSettings(settings);

  if (!settings?.publicEventsVisibility && !session) {
    redirect('/login?callbackUrl=/events');
  }

  const upcoming = await prisma.booking.findMany({
    where: { status: 'APPROVED', startTime: { gte: new Date() } },
    include: { space: { select: { title: true, address: true } } },
    orderBy: { startTime: 'asc' },
    take: 20,
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Афиша мероприятий',
    itemListElement: upcoming.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime.toISOString(),
        endDate: e.endTime.toISOString(),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: e.space?.title || 'Площадка',
          address: e.space?.address || 'Сочи',
        },
        organizer: {
          '@type': 'Organization',
          name: identity.siteName,
          url: identity.publicOrigin,
        },
      },
    })),
  };

  return (
    <div className="container" style={{ padding: '1rem 1rem 3rem', minHeight: 'auto' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="page-hero-title" style={{ marginBottom: '0.35rem' }}>
        Афиша мероприятий
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.35rem', fontSize: '0.98rem' }}>
        Подтверждённые мероприятия в пространствах — запишитесь онлайн
      </p>
      <UpcomingEvents hideTitle mode="grid" />

      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>Календарь</h2>
        <GlobalCalendar />
      </div>
    </div>
  );
}
