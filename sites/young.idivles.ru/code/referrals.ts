/**
 * Реферальная система Young Portal.
 *
 * Связь с рейтингами:
 * - Эко: основная валюта наград (реферер и частично реферал).
 * - Социум: небольшие плюсы за «привёл человека в сообщество».
 * - Авторитет: только когда реферал реально пришёл на мероприятие (check-in).
 *
 * Антифрод (обязательно):
 * - один реферер на аккаунт навсегда;
 * - нельзя пригласить себя;
 * - лимиты по IP / fingerprint / сутки / неделю;
 * - совпадение устройства реферера и реферала → reject;
 * - крупные награды только после check-in / инструктажа / профиля;
 * - идемпотентный ledger (уникальный kind на referral).
 */
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { bumpEcoPoints } from '@/lib/eco-points';
import { bumpSocialScore } from '@/lib/reputation';
import { bumpReliability } from '@/lib/reliability';

export const REF = {
  /** Cookie / query param */
  COOKIE: 'yp_ref',
  COOKIE_DAYS: 30,
  /** Eco rewards */
  ECO_SIGNUP_REFERRER: 8,
  ECO_SIGNUP_REFEREE: 5,
  ECO_INSTRUCTIONS_REFERRER: 5,
  ECO_CHECKIN_REFERRER: 25,
  ECO_CHECKIN_REFEREE: 10,
  ECO_PROFILE_REFERRER: 6,
  ECO_PROFILE_REFEREE: 4,
  ECO_FRIEND_REFERRER: 8,
  ECO_FRIEND_REFEREE: 4,
  ECO_MILESTONE_3: 40,
  ECO_MILESTONE_10: 120,
  /** Social */
  SOCIAL_SIGNUP: 1,
  SOCIAL_INSTRUCTIONS: 1,
  SOCIAL_CHECKIN: 2,
  SOCIAL_PROFILE: 1,
  SOCIAL_FRIEND: 2,
  SOCIAL_MILESTONE_3: 3,
  SOCIAL_MILESTONE_10: 5,
  /** Authority — only when referee actually attends */
  AUTHORITY_CHECKIN_REFERRER: 1,
  /** Caps */
  DAILY_ECO_CAP_REFERRER: 80,
  WEEKLY_ECO_CAP_REFERRER: 320,
  MAX_SIGNUPS_SAME_IP_PER_DAY: 3,
  MAX_SIGNUPS_SAME_FP_LIFETIME: 2,
  MAX_REFERALS_PER_DAY: 8,
  /** Referrer must be «trustworthy» for bonuses beyond signup */
  REFERRER_MIN_RELIABILITY: 60,
  REFERRER_MIN_AGE_HOURS: 24,
  /** Hold check-in bonus if referee account younger than this */
  REFEREE_MIN_AGE_HOURS_FOR_CHECKIN: 2,
  FRAUD_REJECT_SCORE: 60,
} as const;

export type ReferralRewardKind =
  | 'SIGNUP'
  | 'INSTRUCTIONS'
  | 'CHECK_IN'
  | 'PROFILE'
  | 'FRIEND'
  | 'MILESTONE_3'
  | 'MILESTONE_10';

function hashIp(ip: string | null | undefined) {
  const raw = (ip || '').trim();
  if (!raw) return null;
  return createHash('sha256').update(`yp-ref-ip:${raw}`).digest('hex').slice(0, 32);
}

function normFp(fp: string | null | undefined) {
  const v = (fp || '').trim().slice(0, 128);
  return v || null;
}

export function normalizeReferralCode(raw: string | null | undefined) {
  const c = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
  return c || null;
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, publicCode: true },
  });
  if (!user) throw new Error('USER_NOT_FOUND');
  if (user.referralCode) return user.referralCode;

  for (let i = 0; i < 10; i++) {
    const suffix = (user.publicCode || randomBytes(3).toString('hex')).replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase();
    const code = `R-${suffix || randomBytes(3).toString('hex').toUpperCase()}`;
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return code;
    } catch (e: any) {
      if (e?.code === 'P2002') continue;
      throw e;
    }
  }
  throw new Error('CODE_GEN_FAILED');
}

export async function resolveReferrerByCode(codeRaw: string) {
  const code = normalizeReferralCode(codeRaw);
  if (!code) return null;
  return prisma.user.findFirst({
    where: { referralCode: { equals: code, mode: 'insensitive' }, deletedAt: null, blockedAt: null },
    select: {
      id: true,
      referralCode: true,
      name: true,
      nickname: true,
      reliabilityScore: true,
      instructionsCompletedAt: true,
      createdAt: true,
    },
  });
}

async function referrerEcoFromReferralsSince(referrerId: string, since: Date) {
  const rows = await prisma.referralReward.aggregate({
    where: { referrerId, createdAt: { gte: since }, ecoDelta: { gt: 0 } },
    _sum: { ecoDelta: true },
  });
  return rows._sum.ecoDelta ?? 0;
}

async function computeFraudScore(opts: {
  referrerId: string;
  refereeId: string;
  signupIpHash: string | null;
  signupFp: string | null;
}): Promise<{ score: number; flags: string[] }> {
  const flags: string[] = [];
  let score = 0;

  if (opts.referrerId === opts.refereeId) {
    return { score: 100, flags: ['self'] };
  }

  const [referrerDevices, refereeDevices, sameIpToday, sameFpCount, referrerToday] = await Promise.all([
    opts.signupFp
      ? prisma.trustedDevice.findMany({
          where: { userId: opts.referrerId },
          select: { fingerprint: true },
          take: 20,
        })
      : Promise.resolve([] as { fingerprint: string }[]),
    opts.signupFp
      ? prisma.trustedDevice.findMany({
          where: { userId: opts.refereeId },
          select: { fingerprint: true },
          take: 20,
        })
      : Promise.resolve([] as { fingerprint: string }[]),
    opts.signupIpHash
      ? prisma.referral.count({
          where: {
            referrerId: opts.referrerId,
            signupIpHash: opts.signupIpHash,
            createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
          },
        })
      : Promise.resolve(0),
    opts.signupFp
      ? prisma.referral.count({
          where: { signupFp: opts.signupFp },
        })
      : Promise.resolve(0),
    prisma.referral.count({
      where: {
        referrerId: opts.referrerId,
        createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    }),
  ]);

  const refFps = new Set(referrerDevices.map((d) => d.fingerprint));
  if (opts.signupFp && refFps.has(opts.signupFp)) {
    flags.push('same_device_as_referrer');
    score += 70;
  }
  const overlap = refereeDevices.some((d) => refFps.has(d.fingerprint));
  if (overlap) {
    flags.push('device_overlap');
    score += 55;
  }
  if (sameIpToday >= REF.MAX_SIGNUPS_SAME_IP_PER_DAY) {
    flags.push('ip_velocity');
    score += 40;
  }
  if (sameFpCount >= REF.MAX_SIGNUPS_SAME_FP_LIFETIME) {
    flags.push('fp_velocity');
    score += 50;
  }
  if (referrerToday >= REF.MAX_REFERALS_PER_DAY) {
    flags.push('daily_quota');
    score += 35;
  }

  // High reject rate for this referrer
  const recent = await prisma.referral.findMany({
    where: { referrerId: opts.referrerId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { status: true },
  });
  if (recent.length >= 8) {
    const rejected = recent.filter((r) => r.status === 'REJECTED').length;
    if (rejected / recent.length >= 0.5) {
      flags.push('referrer_reject_rate');
      score += 25;
    }
  }

  return { score, flags };
}

async function referrerEligibleForBonus(referrerId: string) {
  const u = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      reliabilityScore: true,
      createdAt: true,
      instructionsCompletedAt: true,
      deletedAt: true,
      blockedAt: true,
    },
  });
  if (!u || u.deletedAt || u.blockedAt) return false;
  const ageH = (Date.now() - u.createdAt.getTime()) / 3600000;
  if (ageH < REF.REFERRER_MIN_AGE_HOURS && !u.instructionsCompletedAt) return false;
  if ((u.reliabilityScore ?? 100) < REF.REFERRER_MIN_RELIABILITY) return false;
  return true;
}

async function withinCaps(referrerId: string, ecoDelta: number) {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [day, week] = await Promise.all([
    referrerEcoFromReferralsSince(referrerId, dayAgo),
    referrerEcoFromReferralsSince(referrerId, weekAgo),
  ]);
  if (day + ecoDelta > REF.DAILY_ECO_CAP_REFERRER) return false;
  if (week + ecoDelta > REF.WEEKLY_ECO_CAP_REFERRER) return false;
  return true;
}

async function payReward(opts: {
  referralId: string;
  referrerId: string;
  refereeId: string;
  kind: ReferralRewardKind;
  ecoReferrer: number;
  ecoReferee?: number;
  socialReferrer?: number;
  socialReferee?: number;
  authorityReferrer?: number;
  meta?: Record<string, unknown>;
}) {
  const existing = await prisma.referralReward.findUnique({
    where: { referralId_kind: { referralId: opts.referralId, kind: opts.kind } },
  });
  if (existing) return { ok: false as const, reason: 'already' as const };

  if (opts.ecoReferrer > 0) {
    const okCap = await withinCaps(opts.referrerId, opts.ecoReferrer);
    if (!okCap) return { ok: false as const, reason: 'cap' as const };
  }

  // Create ledger first (unique) — race-safe
  try {
    await prisma.referralReward.create({
      data: {
        referralId: opts.referralId,
        referrerId: opts.referrerId,
        refereeId: opts.refereeId,
        kind: opts.kind,
        ecoDelta: opts.ecoReferrer + (opts.ecoReferee || 0),
        socialDelta: (opts.socialReferrer || 0) + (opts.socialReferee || 0),
        authorityDelta: opts.authorityReferrer || 0,
        metaJson: opts.meta ? JSON.stringify(opts.meta) : null,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return { ok: false as const, reason: 'already' as const };
    throw e;
  }

  const tasks: Promise<unknown>[] = [];
  if (opts.ecoReferrer) {
    tasks.push(
      bumpEcoPoints(opts.referrerId, opts.ecoReferrer, `referral_${opts.kind.toLowerCase()}`, {
        referralId: opts.referralId,
        role: 'referrer',
      })
    );
  }
  if (opts.ecoReferee) {
    tasks.push(
      bumpEcoPoints(opts.refereeId, opts.ecoReferee, `referral_${opts.kind.toLowerCase()}_welcome`, {
        referralId: opts.referralId,
        role: 'referee',
      })
    );
  }
  if (opts.socialReferrer) {
    tasks.push(bumpSocialScore(opts.referrerId, opts.socialReferrer, `Реферал: ${opts.kind}`));
  }
  if (opts.socialReferee) {
    tasks.push(bumpSocialScore(opts.refereeId, opts.socialReferee, `Реферал: ${opts.kind}`));
  }
  if (opts.authorityReferrer) {
    tasks.push(
      bumpReliability(opts.referrerId, opts.authorityReferrer, undefined)
    );
  }
  await Promise.allSettled(tasks);
  return { ok: true as const };
}

/** Called once when referee account is created (email verified). */
export async function attributeReferralOnSignup(opts: {
  refereeId: string;
  code: string | null | undefined;
  ip?: string | null;
  fingerprint?: string | null;
}) {
  const code = normalizeReferralCode(opts.code);
  if (!code) return { ok: false as const, reason: 'no_code' as const };

  const existing = await prisma.referral.findUnique({ where: { refereeId: opts.refereeId } });
  if (existing) return { ok: false as const, reason: 'already_attributed' as const };

  const referrer = await resolveReferrerByCode(code);
  if (!referrer) return { ok: false as const, reason: 'invalid_code' as const };
  if (referrer.id === opts.refereeId) return { ok: false as const, reason: 'self' as const };

  const signupIpHash = hashIp(opts.ip);
  const signupFp = normFp(opts.fingerprint);
  const fraud = await computeFraudScore({
    referrerId: referrer.id,
    refereeId: opts.refereeId,
    signupIpHash,
    signupFp,
  });

  const status = fraud.score >= REF.FRAUD_REJECT_SCORE ? 'REJECTED' : 'SIGNED_UP';

  const row = await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId: opts.refereeId,
      code: referrer.referralCode || code,
      status,
      signupIpHash,
      signupFp,
      fraudScore: fraud.score,
      fraudFlagsJson: JSON.stringify(fraud.flags),
    },
  });

  await prisma.user.update({
    where: { id: opts.refereeId },
    data: { referredById: referrer.id },
  });

  if (status === 'REJECTED') {
    return { ok: false as const, reason: 'fraud' as const, referralId: row.id, flags: fraud.flags };
  }

  // Small signup reward (eligible referrer only for referrer side)
  const eligible = await referrerEligibleForBonus(referrer.id);
  await payReward({
    referralId: row.id,
    referrerId: referrer.id,
    refereeId: opts.refereeId,
    kind: 'SIGNUP',
    ecoReferrer: eligible ? REF.ECO_SIGNUP_REFERRER : 0,
    ecoReferee: REF.ECO_SIGNUP_REFEREE,
    socialReferrer: eligible ? REF.SOCIAL_SIGNUP : 0,
    meta: { eligible },
  });

  return { ok: true as const, referralId: row.id, referrerId: referrer.id };
}

async function getActiveReferralForReferee(refereeId: string) {
  return prisma.referral.findUnique({
    where: { refereeId },
  });
}

export async function onReferralInstructionsComplete(refereeId: string) {
  const row = await getActiveReferralForReferee(refereeId);
  if (!row || row.status === 'REJECTED') return;
  const eligible = await referrerEligibleForBonus(row.referrerId);
  if (!eligible) return;
  await payReward({
    referralId: row.id,
    referrerId: row.referrerId,
    refereeId,
    kind: 'INSTRUCTIONS',
    ecoReferrer: REF.ECO_INSTRUCTIONS_REFERRER,
    socialReferrer: REF.SOCIAL_INSTRUCTIONS,
  });
}

export async function onReferralCheckIn(refereeId: string, bookingId?: string) {
  const row = await getActiveReferralForReferee(refereeId);
  if (!row || row.status === 'REJECTED') return;

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { createdAt: true },
  });
  if (!referee) return;
  const ageH = (Date.now() - referee.createdAt.getTime()) / 3600000;
  if (ageH < REF.REFEREE_MIN_AGE_HOURS_FOR_CHECKIN) return;

  // Re-check fraud lightly on device overlap at check-in time
  if ((row.fraudScore ?? 0) >= REF.FRAUD_REJECT_SCORE) return;

  const eligible = await referrerEligibleForBonus(row.referrerId);
  if (!eligible) return;

  const paid = await payReward({
    referralId: row.id,
    referrerId: row.referrerId,
    refereeId,
    kind: 'CHECK_IN',
    ecoReferrer: REF.ECO_CHECKIN_REFERRER,
    ecoReferee: REF.ECO_CHECKIN_REFEREE,
    socialReferrer: REF.SOCIAL_CHECKIN,
    authorityReferrer: REF.AUTHORITY_CHECKIN_REFERRER,
    meta: { bookingId },
  });

  if (paid.ok) {
    await prisma.referral.update({
      where: { id: row.id },
      data: {
        status: 'QUALIFIED',
        qualifiedAt: new Date(),
      },
    });
    await maybeMilestones(row.referrerId);
  }
}

export async function onReferralProfileComplete(refereeId: string) {
  const row = await getActiveReferralForReferee(refereeId);
  if (!row || row.status === 'REJECTED') return;

  const u = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { bio: true, city: true, image: true },
  });
  if (!u?.bio?.trim() || !u?.city?.trim() || !u?.image) return;

  const eligible = await referrerEligibleForBonus(row.referrerId);
  if (!eligible) return;

  await payReward({
    referralId: row.id,
    referrerId: row.referrerId,
    refereeId,
    kind: 'PROFILE',
    ecoReferrer: REF.ECO_PROFILE_REFERRER,
    ecoReferee: REF.ECO_PROFILE_REFEREE,
    socialReferrer: REF.SOCIAL_PROFILE,
  });
}

export async function onReferralFriendship(userA: string, userB: string) {
  const rows = await prisma.referral.findMany({
    where: {
      status: { not: 'REJECTED' },
      OR: [
        { referrerId: userA, refereeId: userB },
        { referrerId: userB, refereeId: userA },
      ],
    },
  });
  for (const row of rows) {
    const eligible = await referrerEligibleForBonus(row.referrerId);
    if (!eligible) continue;
    await payReward({
      referralId: row.id,
      referrerId: row.referrerId,
      refereeId: row.refereeId,
      kind: 'FRIEND',
      ecoReferrer: REF.ECO_FRIEND_REFERRER,
      ecoReferee: REF.ECO_FRIEND_REFEREE,
      socialReferrer: REF.SOCIAL_FRIEND,
      socialReferee: 1,
    });
  }
}

async function maybeMilestones(referrerId: string) {
  const qualified = await prisma.referral.count({
    where: { referrerId, status: 'QUALIFIED' },
  });
  // Use a synthetic referral id of first referral for ledger uniqueness via kind only —
  // we store milestone on a dedicated row keyed by referrer+kind using refereeId=referrerId sentinel.
  // Better: unique on referrerId+kind for milestones via separate find.
  const existing3 = await prisma.referralReward.findFirst({
    where: { referrerId, kind: 'MILESTONE_3' },
  });
  if (qualified >= 3 && !existing3) {
    const any = await prisma.referral.findFirst({ where: { referrerId }, select: { id: true, refereeId: true } });
    if (any) {
      await payReward({
        referralId: any.id,
        referrerId,
        refereeId: any.refereeId,
        kind: 'MILESTONE_3',
        ecoReferrer: REF.ECO_MILESTONE_3,
        socialReferrer: REF.SOCIAL_MILESTONE_3,
        meta: { qualified },
      });
    }
  }
  const existing10 = await prisma.referralReward.findFirst({
    where: { referrerId, kind: 'MILESTONE_10' },
  });
  if (qualified >= 10 && !existing10) {
    const any = await prisma.referral.findFirst({ where: { referrerId }, select: { id: true, refereeId: true } });
    if (any) {
      await payReward({
        referralId: any.id,
        referrerId,
        refereeId: any.refereeId,
        kind: 'MILESTONE_10',
        ecoReferrer: REF.ECO_MILESTONE_10,
        socialReferrer: REF.SOCIAL_MILESTONE_10,
        meta: { qualified },
      });
    }
  }
}

export async function getReferralDashboard(userId: string) {
  const code = await ensureReferralCode(userId);
  const [mine, asReferee, rewardsSum, qualified] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        referee: { select: { id: true, name: true, nickname: true, image: true, publicCode: true, createdAt: true } },
      },
    }),
    prisma.referral.findUnique({
      where: { refereeId: userId },
      include: {
        referrer: { select: { id: true, name: true, nickname: true, publicCode: true, referralCode: true } },
      },
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: userId },
      _sum: { ecoDelta: true, socialDelta: true, authorityDelta: true },
    }),
    prisma.referral.count({ where: { referrerId: userId, status: 'QUALIFIED' } }),
  ]);

  const origin = process.env.NEXTAUTH_URL || 'https://young.idivles.ru';
  return {
    code,
    link: `${origin.replace(/\/$/, '')}/r/${encodeURIComponent(code)}`,
    registerLink: `${origin.replace(/\/$/, '')}/register?ref=${encodeURIComponent(code)}`,
    stats: {
      invited: mine.length,
      qualified,
      rejected: mine.filter((m) => m.status === 'REJECTED').length,
      ecoEarned: rewardsSum._sum.ecoDelta ?? 0,
      socialEarned: rewardsSum._sum.socialDelta ?? 0,
      authorityEarned: rewardsSum._sum.authorityDelta ?? 0,
    },
    rewards: REF,
    referredBy: asReferee?.referrer
      ? {
          name: asReferee.referrer.nickname || asReferee.referrer.name,
          code: asReferee.referrer.referralCode,
          publicCode: asReferee.referrer.publicCode,
        }
      : null,
    recent: mine.map((m) => ({
      id: m.id,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      qualifiedAt: m.qualifiedAt?.toISOString() ?? null,
      referee: {
        name: m.referee.nickname || m.referee.name,
        publicCode: m.referee.publicCode,
        image: m.referee.image,
      },
    })),
  };
}
