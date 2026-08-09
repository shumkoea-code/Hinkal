import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { newTokenKeepAlive } from '@/lib/content-moderation';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { profanityResponse } from '@/lib/censor';
import { normalizePhone } from '@/lib/phone';
import { parseTagList, serializeTagList, zodiacFromDate } from '@/lib/profile-meta';
import { isRussianEmail, RU_EMAIL_HINT } from '@/lib/ru-email';
import { assertTrustedDevice } from '@/lib/trusted-device';
import { processDueAccountDeletions } from '@/lib/account-deletion';
import { newFriendInviteToken } from '@/lib/social';

import { ensureUserPublicCode } from '@/lib/ensure-public-code';
import {
  normalizeMaxUrl,
  normalizeSteamUrl,
  normalizeTelegramUrl,
  normalizeVkUrl,
  validateNickname,
} from '@/lib/public-id';
import {
  parseShowcaseBadges,
  serializeShowcaseBadges,
} from '@/lib/showcase-badges';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { onReferralProfileComplete } from '@/lib/referrals';

const profileSchema = z.object({
  name: z.string().min(2, 'Имя слишком короткое').max(100).optional(),
  email: z.string().email('Некорректный email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  password: z.string().min(8, 'Пароль должен быть минимум 8 символов').max(100).optional().or(z.literal('')),
  currentPassword: z.string().max(100).optional().or(z.literal('')),
  fingerprint: z.string().max(128).optional().or(z.literal('')),
  image: z
    .string()
    .refine(
      (v) => !v || v.startsWith('/uploads/') || /^https?:\/\//i.test(v),
      'Некорректная ссылка на изображение'
    )
    .optional()
    .or(z.literal('')),
  birthDate: z.string().optional().or(z.literal('')).nullable(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  bio: z.string().max(280).optional().or(z.literal('')).nullable(),
  city: z.string().max(80).optional().or(z.literal('')).nullable(),
  about: z.string().max(2000).optional().or(z.literal('')).nullable(),
  hobbies: z.union([z.array(z.string()), z.string()]).optional(),
  interests: z.union([z.array(z.string()), z.string()]).optional(),
  profileVisibility: z.enum(['PUBLIC', 'FRIENDS', 'PRIVATE']).optional(),
  onlineVisibility: z.enum(['FRIENDS', 'PUBLIC', 'HIDDEN']).optional(),
  regenerateInviteToken: z.boolean().optional(),
  nickname: z.string().max(24).optional().or(z.literal('')).nullable(),
  steamUrl: z.string().max(500).optional().or(z.literal('')).nullable(),
  vkUrl: z.string().max(500).optional().or(z.literal('')).nullable(),
  telegramUrl: z.string().max(500).optional().or(z.literal('')).nullable(),
  telegramChatId: z.string().max(32).optional().or(z.literal('')).nullable(),
  maxUserId: z.string().max(32).optional().or(z.literal('')).nullable(),
  maxUrl: z.string().max(500).optional().or(z.literal('')).nullable(),
  showcaseBadges: z.union([z.array(z.string()), z.string()]).optional().nullable(),
});

const PROFILE_SELECT = {
  id: true,
  publicCode: true,
  nickname: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  reliabilityScore: true,
  socialScore: true,
  ecoPoints: true,
  cosmeticsJson: true,
  ecoLoadoutJson: true,
  attendedCount: true,
  noShowCount: true,
  privacyAcceptedAt: true,
  privacyFirstAcceptedAt: true,
  privacyRefusedAt: true,
  privacySignature: true,
  privacyPolicyVersion: true,
  cookiesAcceptedAt: true,
  cookiesSignature: true,
  cookiesPolicyVersion: true,
  rulesAcceptedAt: true,
  rulesSignature: true,
  rulesPolicyVersion: true,
  birthDate: true,
  gender: true,
  bio: true,
  city: true,
  about: true,
  hobbies: true,
  interests: true,
  instructionsVersion: true,
  instructionsCompletedAt: true,
  showcaseBadges: true,
  profileVisibility: true,
  onlineVisibility: true,
  lastActiveAt: true,
  friendInviteToken: true,
  deletionRequestedAt: true,
  deletionEffectiveAt: true,
  deletedAt: true,
  steamUrl: true,
  vkUrl: true,
  telegramUrl: true,
  telegramChatId: true,
  maxUserId: true,
  maxUrl: true,
} as const;

function publicProfile(user: any) {
  const hobbies = parseTagList(user.hobbies);
  const interests = parseTagList(user.interests);
  return {
    ...user,
    hobbies,
    interests,
    showcaseBadges: parseShowcaseBadges(user.showcaseBadges),
    zodiac: zodiacFromDate(user.birthDate),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    await ensureUserPublicCode(session.user.id);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILE_SELECT,
    });

    void processDueAccountDeletions(3).catch(() => null);

    return NextResponse.json(publicProfile(user), { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = profileSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Некорректные данные';
      return NextResponse.json({ message: errorMsg }, { status: 400 });
    }

    const data = parseResult.data;
    const dirty =
      profanityResponse(data.name) ||
      profanityResponse(data.bio) ||
      profanityResponse(data.about) ||
      profanityResponse(data.nickname || undefined);
    if (dirty) return dirty;

    const userId = session.user.id;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, email: true, phone: true, password: true },
    });
    if (me?.deletedAt) {
      return NextResponse.json({ message: 'Аккаунт удалён' }, { status: 403 });
    }

    await ensureUserPublicCode(userId);

    const emailChanging = Boolean(
      data.email && data.email.trim() && data.email.trim().toLowerCase() !== (me?.email || '').toLowerCase()
    );
    const nextPhone = data.phone !== undefined ? normalizePhone(data.phone || '') : '';
    const curPhone = normalizePhone(me?.phone || '');
    const phoneChanging = Boolean(data.phone !== undefined && data.phone !== '' && nextPhone !== curPhone);
    const passwordChanging = Boolean(data.password);
    if (emailChanging || phoneChanging || passwordChanging) {
      const trust = await assertTrustedDevice(userId, data.fingerprint || null);
      if (!trust.ok) {
        return NextResponse.json({ message: trust.message, trust: trust.status }, { status: 403 });
      }
    }

    if (passwordChanging) {
      if (!data.currentPassword) {
        return NextResponse.json({ message: 'Укажите текущий пароль' }, { status: 400 });
      }
      if (!me?.password) {
        return NextResponse.json({ message: 'Пароль для этого аккаунта не задан' }, { status: 400 });
      }
      const ok = await bcrypt.compare(data.currentPassword, me.password);
      if (!ok) {
        return NextResponse.json({ message: 'Неверный текущий пароль' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.image !== undefined) updateData.image = data.image || null;
    if (data.bio !== undefined) updateData.bio = (data.bio || '').trim() || null;
    if (data.city !== undefined) updateData.city = (data.city || '').trim() || null;
    if (data.about !== undefined) updateData.about = (data.about || '').trim() || null;

    if (data.nickname !== undefined) {
      try {
        const nick = validateNickname(data.nickname);
        if (nick) {
          const taken = await prisma.user.findFirst({
            where: {
              id: { not: userId },
              nickname: { equals: nick, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (taken) {
            return NextResponse.json({ message: 'Этот никнейм уже занят' }, { status: 400 });
          }
        }
        updateData.nickname = nick;
      } catch (e) {
        return NextResponse.json(
          { message: e instanceof Error ? e.message : 'Некорректный никнейм' },
          { status: 400 }
        );
      }
    }

    try {
      if (data.steamUrl !== undefined) updateData.steamUrl = normalizeSteamUrl(data.steamUrl);
      if (data.vkUrl !== undefined) updateData.vkUrl = normalizeVkUrl(data.vkUrl);
      if (data.telegramUrl !== undefined) updateData.telegramUrl = normalizeTelegramUrl(data.telegramUrl);
      if (data.telegramChatId !== undefined) {
        const tg = String(data.telegramChatId || '').replace(/[^0-9]/g, '');
        updateData.telegramChatId = tg || null;
        (updateData as Record<string, unknown>).telegramLinkedAt = tg ? new Date() : null;
      }
      if (data.maxUserId !== undefined) {
        const mx = String(data.maxUserId || '').replace(/[^0-9]/g, '');
        updateData.maxUserId = mx || null;
      }
      if (data.maxUrl !== undefined) updateData.maxUrl = normalizeMaxUrl(data.maxUrl);
    } catch (e) {
      return NextResponse.json(
        { message: e instanceof Error ? e.message : 'Некорректная ссылка' },
        { status: 400 }
      );
    }

    if (data.birthDate !== undefined) {
      if (!data.birthDate) updateData.birthDate = null;
      else {
        const d = new Date(data.birthDate);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ message: 'Некорректная дата рождения' }, { status: 400 });
        }
        updateData.birthDate = d;
      }
    }

    if (data.gender !== undefined) {
      updateData.gender = data.gender === 'MALE' || data.gender === 'FEMALE' ? data.gender : null;
    }

    if (data.hobbies !== undefined) {
      updateData.hobbies = serializeTagList(parseTagList(data.hobbies));
    }
    if (data.interests !== undefined) {
      updateData.interests = serializeTagList(parseTagList(data.interests));
    }

    if (data.showcaseBadges !== undefined) {
      const wanted = parseShowcaseBadges(data.showcaseBadges);
      if (wanted.length) {
        const valid = new Set(ACHIEVEMENTS.map((a) => a.code));
        const unlocked = await prisma.userAchievement.findMany({
          where: { userId, code: { in: wanted } },
          select: { code: true },
        });
        const ok = new Set(unlocked.map((u) => u.code));
        updateData.showcaseBadges = serializeShowcaseBadges(
          wanted.filter((c) => valid.has(c) && ok.has(c))
        );
      } else {
        updateData.showcaseBadges = serializeShowcaseBadges([]);
      }
    }

    if (data.profileVisibility !== undefined) {
      updateData.profileVisibility = data.profileVisibility;
      if (data.profileVisibility === 'PRIVATE') {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { friendInviteToken: true },
        });
        if (!current?.friendInviteToken) {
          updateData.friendInviteToken = newFriendInviteToken();
        }
      }
    }
    if (data.onlineVisibility !== undefined) {
      updateData.onlineVisibility = data.onlineVisibility;
    }
    if (data.regenerateInviteToken) {
      updateData.friendInviteToken = newFriendInviteToken();
      if (data.profileVisibility === undefined) {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { profileVisibility: true },
        });
        if (current?.profileVisibility !== 'PRIVATE') {
          updateData.profileVisibility = 'PRIVATE';
        }
      }
    }

    if (data.email !== undefined && data.email !== '') {
      const email = data.email.trim().toLowerCase();
      if (!isRussianEmail(email)) {
        return NextResponse.json({ message: RU_EMAIL_HINT }, { status: 400 });
      }
      updateData.email = email;
    }

    if (data.phone !== undefined) {
      if (data.phone === '') updateData.phone = null;
      else {
        const phoneDigits = normalizePhone(data.phone);
        if (phoneDigits.length < 11) {
          return NextResponse.json({ message: 'Некорректный телефон' }, { status: 400 });
        }
        updateData.phone = `+${phoneDigits}`;
        // uniqueness by national 10 digits (8… / 7… / +7…)
        const national = phoneDigits.slice(-10);
        const phoneTaken = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "User"
          WHERE id <> ${userId}
            AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
            AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
          LIMIT 1
        `;
        if (phoneTaken[0]) {
          return NextResponse.json({ message: 'Этот телефон уже используется' }, { status: 400 });
        }
      }
    }

    let keepAlive: string | undefined;
    if (data.password) {
      keepAlive = newTokenKeepAlive();
      updateData.password = await bcrypt.hash(data.password, 12);
      // Invalidate other sessions after password change; keep current via keepAlive
      updateData.tokenVersion = { increment: 1 };
      updateData.tokenKeepAlive = keepAlive;
      updateData.mustChangePassword = false;
    }

    if (updateData.email || updateData.phone) {
      const conflictUser = await prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            ...(updateData.email ? [{ email: updateData.email as string }] : []),
            ...(updateData.phone ? [{ phone: updateData.phone as string }] : []),
          ],
        },
      });
      if (conflictUser) {
        return NextResponse.json(
          { message: 'Этот email или телефон уже используется другим пользователем' },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: PROFILE_SELECT,
    });

    if (user.gender === 'MALE' || user.gender === 'FEMALE') {
      const { unlockAchievement, evaluateAchievements } = await import('@/lib/award-achievements');
      await unlockAchievement(userId, 'GENDER_SET');
      await evaluateAchievements(userId).catch(() => null);
    }

    void onReferralProfileComplete(session.user.id).catch(() => null);

    return NextResponse.json(
      {
        message: 'Профиль успешно сохранен!',
        user: publicProfile(user),
        ...(keepAlive ? { keepAlive } : {}),
      },
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
