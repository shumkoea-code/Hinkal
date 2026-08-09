/**
 * Unique content views + viewer identity (user / device cookie / fingerprint).
 */
import { createHash, randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export const VIEW_COOKIE = 'yp_vid';
export const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const CONTENT_VIEW_TYPES = ['PROJECT', 'CLUB', 'NEWS', 'PLACE', 'EVENT', 'GAME'] as const;
export type ContentViewType = (typeof CONTENT_VIEW_TYPES)[number];

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|scrapy|headlesschrome|phantomjs/i;

export function isContentViewType(raw: string): raw is ContentViewType {
  return (CONTENT_VIEW_TYPES as readonly string[]).includes(raw);
}

export function isBotUserAgent(ua: string | null | undefined) {
  return Boolean(ua && BOT_UA.test(ua));
}

export function hashIp(ip: string | null | undefined) {
  const secret = process.env.NEXTAUTH_SECRET || 'yp-views';
  const raw = `${(ip || '0.0.0.0').trim()}|${secret}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
}

function normalizeDeviceId(raw: string | null | undefined) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9-]/g, '')
    .slice(0, 64);
  if (/^[a-f0-9]{16,64}$/i.test(s)) return s;
  return '';
}

export async function resolveViewerKey(opts: {
  userId?: string | null;
  clientDeviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ viewerKey: string; deviceId: string | null; setCookieVid: string | null }> {
  if (opts.userId) {
    return { viewerKey: `u:${opts.userId}`, deviceId: null, setCookieVid: null };
  }

  const jar = await cookies();
  const existing = jar.get(VIEW_COOKIE)?.value?.trim() || '';
  if (/^[a-f0-9-]{16,64}$/i.test(existing)) {
    const vid = existing.toLowerCase().replace(/-/g, '').slice(0, 32);
    return { viewerKey: `d:${vid}`, deviceId: vid, setCookieVid: null };
  }

  const fromClient = normalizeDeviceId(opts.clientDeviceId);
  if (fromClient) {
    return { viewerKey: `d:${fromClient}`, deviceId: fromClient, setCookieVid: fromClient };
  }

  // Soft fallback — no cookie (would remake key as d:uuid and double-count).
  const soft = createHash('sha256')
    .update(
      `${opts.ip || '0'}|${(opts.userAgent || '').slice(0, 180)}|${process.env.NEXTAUTH_SECRET || 'yp'}`
    )
    .digest('hex')
    .slice(0, 32);
  const vid = soft || randomUUID().replace(/-/g, '').slice(0, 32);
  return { viewerKey: `d:ipua:${vid}`, deviceId: vid, setCookieVid: null };
}

async function bumpDenormalizedCount(type: ContentViewType, id: string): Promise<number> {
  if (type === 'PROJECT') {
    const row = await prisma.project.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return row.viewCount;
  }
  if (type === 'CLUB') {
    const row = await prisma.club.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return row.viewCount;
  }
  if (type === 'NEWS') {
    const row = await prisma.news.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return row.viewCount;
  }
  if (type === 'PLACE') {
    const row = await prisma.place.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return row.viewCount;
  }
  if (type === 'EVENT') {
    const row = await prisma.booking.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return row.viewCount;
  }
  // GAME → ContentViewStats
  const stats = await prisma.contentViewStats.upsert({
    where: { contentType_contentId: { contentType: type, contentId: id } },
    create: { contentType: type, contentId: id, viewCount: 1 },
    update: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });
  return stats.viewCount;
}

export async function readViewCount(type: ContentViewType, id: string): Promise<number> {
  if (type === 'PROJECT') {
    const r = await prisma.project.findUnique({ where: { id }, select: { viewCount: true } });
    return r?.viewCount ?? 0;
  }
  if (type === 'CLUB') {
    const r = await prisma.club.findUnique({ where: { id }, select: { viewCount: true } });
    return r?.viewCount ?? 0;
  }
  if (type === 'NEWS') {
    const r = await prisma.news.findUnique({ where: { id }, select: { viewCount: true } });
    return r?.viewCount ?? 0;
  }
  if (type === 'PLACE') {
    const r = await prisma.place.findUnique({ where: { id }, select: { viewCount: true } });
    return r?.viewCount ?? 0;
  }
  if (type === 'EVENT') {
    const r = await prisma.booking.findUnique({ where: { id }, select: { viewCount: true } });
    return r?.viewCount ?? 0;
  }
  const r = await prisma.contentViewStats.findUnique({
    where: { contentType_contentId: { contentType: type, contentId: id } },
    select: { viewCount: true },
  });
  return r?.viewCount ?? 0;
}

async function entityExists(type: ContentViewType, id: string): Promise<boolean> {
  if (type === 'GAME') {
    const { isGameId } = await import('@/lib/games');
    return isGameId(id);
  }
  if (type === 'PROJECT') return Boolean(await prisma.project.findUnique({ where: { id }, select: { id: true } }));
  if (type === 'CLUB') return Boolean(await prisma.club.findUnique({ where: { id }, select: { id: true } }));
  if (type === 'NEWS') return Boolean(await prisma.news.findUnique({ where: { id }, select: { id: true } }));
  if (type === 'PLACE') return Boolean(await prisma.place.findUnique({ where: { id }, select: { id: true } }));
  if (type === 'EVENT') return Boolean(await prisma.booking.findUnique({ where: { id }, select: { id: true } }));
  return false;
}

export async function recordContentView(opts: {
  type: ContentViewType;
  id: string;
  userId?: string | null;
  clientDeviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  isPrefetch?: boolean;
}): Promise<{ counted: boolean; viewCount: number; setCookieVid: string | null; ecoAwarded: number }> {
  const current = await readViewCount(opts.type, opts.id);

  if (opts.isPrefetch) {
    return { counted: false, viewCount: current, setCookieVid: null, ecoAwarded: 0 };
  }
  if (isBotUserAgent(opts.userAgent)) {
    return { counted: false, viewCount: current, setCookieVid: null, ecoAwarded: 0 };
  }
  if (!(await entityExists(opts.type, opts.id))) {
    return { counted: false, viewCount: current, setCookieVid: null, ecoAwarded: 0 };
  }

  const resolved = await resolveViewerKey({
    userId: opts.userId,
    clientDeviceId: opts.clientDeviceId,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  // skipDuplicates avoids Prisma error logs on unique (contentType, contentId, viewerKey)
  const inserted = await prisma.contentView.createMany({
    data: [
      {
        contentType: opts.type,
        contentId: opts.id,
        viewerKey: resolved.viewerKey,
        userId: opts.userId || null,
        deviceId: resolved.deviceId,
        ipHash: hashIp(opts.ip),
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    return {
      counted: false,
      viewCount: await readViewCount(opts.type, opts.id),
      setCookieVid: resolved.setCookieVid,
      ecoAwarded: 0,
    };
  }

  const viewCount = await bumpDenormalizedCount(opts.type, opts.id);

  let ecoAwarded = 0;
  if (opts.userId) {
    try {
      const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
      const { startOfMskDay } = await import('@/lib/msk-day');
      const dayStart = startOfMskDay();
      const todayCount = await prisma.reputationEvent.count({
        where: {
          userId: opts.userId,
          kind: 'ECO',
          reason: 'view_unique',
          createdAt: { gte: dayStart },
        },
      });
      if (todayCount < ECO.VIEW_DAILY_CAP) {
        const awarded = await bumpEcoPoints(opts.userId, ECO.VIEW_UNIQUE, 'view_unique', {
          type: opts.type,
          id: opts.id,
        });
        if (awarded) {
          ecoAwarded = ECO.VIEW_UNIQUE;
          const { evaluateAchievements } = await import('@/lib/award-achievements');
          void evaluateAchievements(opts.userId).catch(() => null);
        }
      } else {
        const { evaluateAchievements } = await import('@/lib/award-achievements');
        void evaluateAchievements(opts.userId).catch(() => null);
      }
    } catch (e) {
      console.warn('[page-views] eco award', (e as Error)?.message || e);
    }
  }

  return { counted: true, viewCount, setCookieVid: resolved.setCookieVid, ecoAwarded };
}

export function viewCookieHeader(vid: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${VIEW_COOKIE}=${vid}; Path=/; Max-Age=${VIEW_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}

/** Helper for request IP from Next headers */
export async function clientIpFromHeaders() {
  const h = await headers();
  const xf = h.get('x-forwarded-for') || '';
  return xf.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}
