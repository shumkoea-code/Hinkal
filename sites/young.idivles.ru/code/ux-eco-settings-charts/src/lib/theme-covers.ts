/** Map weekly afisha / site sections → thematic cover templates. */

const AFISHA_BY_ID: Record<string, string> = {
  gym: '/brand/templates/afisha-gym.svg',
  'young-family': '/brand/templates/afisha-family.svg',
  'clubs-bot': '/brand/templates/afisha-clubs.svg',
  mma: '/brand/templates/afisha-mma.svg',
  film: '/brand/templates/afisha-film.svg',
  vocal: '/brand/templates/afisha-vocal.svg',
};

const SECTION: Record<string, string> = {
  projects: '/brand/templates/section-projects.svg',
  clubs: '/brand/templates/section-clubs.svg',
  spaces: '/brand/templates/section-spaces.svg',
  events: '/brand/templates/section-events.svg',
  news: '/brand/templates/section-news.svg',
  documents: '/brand/templates/section-documents.svg',
  about: '/brand/templates/section-about.svg',
  grants: '/brand/templates/section-grants.svg',
  dobro: '/brand/templates/section-dobro.svg',
  'self-gov': '/brand/templates/section-selfgov.svg',
  contacts: '/brand/templates/section-contacts.svg',
  places: '/brand/templates/section-spaces.svg',
};

/** Generic SVG placeholders that should lose to title-based thematic covers. */
const WEAK_COVER =
  /^\/covers\/(space-|project-|club-|news-|page-|grant-|dobro-|selfgov-)/i;

export const DEFAULT_SECTION_COVER = '/brand/templates/section-default.svg';

/** Normalize entity image URL; empty → thematic fallback. */
export function resolveEntityCover(
  src: string | null | undefined,
  fallback: string = DEFAULT_SECTION_COVER
): string {
  const u = String(src || '').trim();
  if (!u) return fallback;
  if (u.startsWith('/') || /^https?:\/\//i.test(u)) return u;
  return `/${u.replace(/^\/+/, '')}`;
}

export function isWeakCover(src: string | null | undefined): boolean {
  const u = String(src || '').trim();
  if (!u) return true;
  return WEAK_COVER.test(u) || /space-house\.svg/i.test(u);
}

/** Cover for a weekly afisha card (by id / title heuristics). */
export function afishaItemCover(item: { id?: string; title?: string }, index = 0): string {
  const id = String(item.id || '');
  if (AFISHA_BY_ID[id]) return AFISHA_BY_ID[id];
  const t = String(item.title || '').toLowerCase();
  if (/гимнаст/.test(t)) return AFISHA_BY_ID.gym;
  if (/семья|овз/.test(t)) return AFISHA_BY_ID['young-family'];
  if (/нити|амплитуд|новое время/.test(t)) return AFISHA_BY_ID['clubs-bot'];
  if (/мма|рукопаш/.test(t)) return AFISHA_BY_ID.mma;
  if (/фильм|кино/.test(t)) return AFISHA_BY_ID.film;
  if (/вокал|гитар/.test(t)) return AFISHA_BY_ID.vocal;
  if (/йог|медитац|растяж/.test(t)) return '/covers/event-yoga.svg';
  if (/квиз|викторин|интеллект/.test(t)) return '/covers/event-quiz.svg';
  if (/эко|субботник|уборк|дерев/.test(t)) return '/covers/event-eco.svg';
  if (/концерт|музык|джаз|вечер/.test(t)) return '/covers/event-music.svg';
  if (/спорт|воркаут|забег|матч/.test(t)) return '/covers/event-sport.svg';
  if (/мастер|workshop|лекц|встреч/.test(t)) return '/covers/event-workshop.svg';
  const fallback = [
    AFISHA_BY_ID.gym,
    AFISHA_BY_ID['young-family'],
    AFISHA_BY_ID['clubs-bot'],
    AFISHA_BY_ID.mma,
    AFISHA_BY_ID.film,
    AFISHA_BY_ID.vocal,
    '/covers/event-workshop.svg',
    '/covers/event-music.svg',
  ];
  return fallback[index % fallback.length];
}

/** Cover for an approved booking / event card. */
export function eventCover(
  event: { title?: string | null; space?: { image?: string | null; title?: string | null } | null },
  index = 0
): string {
  const spaceImg = String(event.space?.image || '').trim();
  const byTitle = afishaItemCover({ title: event.title || '' }, index);
  // Prefer thematic title cover over weak generic space SVGs
  if (spaceImg && !isWeakCover(spaceImg)) {
    return resolveEntityCover(spaceImg, byTitle || sectionCover('events'));
  }
  if (byTitle) return byTitle;
  if (spaceImg) return resolveEntityCover(spaceImg, sectionCover('events'));
  return sectionCover('events');
}

export function sectionCover(section: string): string {
  return SECTION[section] || DEFAULT_SECTION_COVER;
}

/** Project cover: real uploads win; weak SVGs → section template with variety. */
export function projectCover(
  project: { title?: string | null; image?: string | null },
  index = 0
): string {
  const img = String(project.image || '').trim();
  if (img && !isWeakCover(img)) return resolveEntityCover(img, sectionCover('projects'));
  const t = String(project.title || '').toLowerCase();
  if (/эко|дерев|уборк|планет/.test(t)) return '/covers/project-eco.svg';
  if (/медиа|фото|видео|блог/.test(t)) return '/covers/project-media.svg';
  if (/волонт|добро|помощ/.test(t)) return '/covers/project-volunteers.svg';
  if (/квн|юмор|стендап/.test(t)) return '/covers/project-kvn.svg';
  if (/кампус|универ|школ/.test(t)) return '/covers/project-campus.svg';
  if (/воркаут|спорт|фестив/.test(t)) return '/covers/event-sport.svg';
  if (/порул|авто|водител/.test(t)) return '/covers/event-workshop.svg';
  const variety = [
    '/covers/project-eco.svg',
    '/covers/project-media.svg',
    '/covers/project-volunteers.svg',
    '/covers/project-campus.svg',
    '/covers/event-sport.svg',
    '/covers/event-workshop.svg',
  ];
  return variety[index % variety.length];
}
