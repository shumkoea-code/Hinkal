import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfanityError, scanUnsafeContent } from '@/lib/censor';
import { moderateDirectMessage } from '@/lib/content-moderation';
import { getModerationConfig } from '@/lib/moderation-settings';
import { getAccessSettings, isStaffRole } from '@/lib/access-settings';
import { areFriends, conversationPairKey, otherUserIdFromPair } from '@/lib/social';
import { evaluateAchievements } from '@/lib/award-achievements';
import {
  messagePerHourLimiter,
  messagePerMinuteLimiter,
  rateLimitJson,
} from '@/lib/rateLimit';
import { resolvePublicIdentity } from '@/lib/privacy-alias';
import { resolvePresenceForViewer } from '@/lib/presence';
import { previewForMessage } from '@/lib/message-meta';
import { encodeRouteParam } from '@/lib/route-id';

function unauthorized() {
  return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
}

type Tab = 'personal' | 'clubs' | 'projects' | 'invites';

function parseTab(raw: string | null): Tab {
  const t = String(raw || 'personal').toLowerCase();
  if (t === 'clubs' || t === 'projects' || t === 'invites') return t;
  return 'personal';
}

function sortByPinThenUpdated<T extends { pinned?: boolean; updatedAt: Date | string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) return unauthorized();

    const url = new URL(req.url);
    const tab = parseTab(url.searchParams.get('tab'));
    const showArchived = url.searchParams.get('showArchived') === '1';
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();

    if (tab === 'invites') {
      const [entityInvites, bookingInvites, placeInvites] = await Promise.all([
        prisma.entityInvite.findMany({
          where: { inviteeId: me, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            kind: true,
            message: true,
            createdAt: true,
            projectId: true,
            clubId: true,
            project: { select: { id: true, title: true } },
            club: { select: { id: true, title: true } },
            inviter: { select: { id: true, name: true, nickname: true, image: true, publicCode: true } },
          },
        }),
        prisma.bookingInvite.findMany({
          where: { toUserId: me, status: 'SENT' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            message: true,
            createdAt: true,
            booking: {
              select: {
                id: true,
                title: true,
                startTime: true,
                space: { select: { title: true } },
              },
            },
            fromUser: { select: { id: true, name: true, nickname: true, image: true, publicCode: true } },
          },
        }).catch(() => []),
        prisma.placeInvite.findMany({
          where: { toUserId: me },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            message: true,
            createdAt: true,
            place: { select: { id: true, title: true, slug: true } },
            fromUser: { select: { id: true, name: true, nickname: true, image: true, publicCode: true } },
          },
        }).catch(() => []),
      ]);

      const invites = [
        ...entityInvites.map((inv) => {
          const entity = inv.kind === 'PROJECT' ? inv.project : inv.club;
          const entityId = inv.kind === 'PROJECT' ? inv.projectId! : inv.clubId!;
          const base = inv.kind === 'PROJECT' ? '/projects' : '/clubs';
          return {
            type: 'ENTITY_INVITE' as const,
            id: inv.id,
            inviteId: inv.id,
            title: entity?.title || (inv.kind === 'CLUB' ? 'Клуб' : 'Проект'),
            subtitle: inv.kind === 'CLUB' ? 'Приглашение в клуб' : 'Приглашение в проект',
            note: inv.message,
            href: `${base}/${encodeRouteParam(entityId)}`,
            createdAt: inv.createdAt,
            from: {
              id: inv.inviter.id,
              name: inv.inviter.nickname || inv.inviter.name,
              image: inv.inviter.image,
              publicCode: inv.inviter.publicCode,
            },
            entityKind: inv.kind,
            entityId,
          };
        }),
        ...(Array.isArray(bookingInvites) ? bookingInvites : []).map((inv) => ({
          type: 'EVENT_INVITE' as const,
          id: inv.id,
          inviteId: inv.id,
          title: inv.booking?.title || 'Мероприятие',
          subtitle: 'Приглашение на мероприятие',
          note: inv.message,
          href: '/events',
          createdAt: inv.createdAt,
          from: {
            id: inv.fromUser.id,
            name: inv.fromUser.nickname || inv.fromUser.name,
            image: inv.fromUser.image,
            publicCode: inv.fromUser.publicCode,
          },
          bookingId: inv.booking?.id,
        })),
        ...(Array.isArray(placeInvites) ? placeInvites : []).map((inv) => ({
          type: 'PLACE_INVITE' as const,
          id: inv.id,
          inviteId: inv.id,
          title: inv.place?.title || 'Место',
          subtitle: 'Приглашение сходить',
          note: inv.message,
          href: inv.place?.slug ? `/places/${inv.place.slug}` : `/places/${inv.place?.id || ''}`,
          createdAt: inv.createdAt,
          from: {
            id: inv.fromUser.id,
            name: inv.fromUser.nickname || inv.fromUser.name,
            image: inv.fromUser.image,
            publicCode: inv.fromUser.publicCode,
          },
          placeId: inv.place?.id,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return NextResponse.json({ tab, invites });
    }

    if (tab === 'clubs' || tab === 'projects') {
      const kind = tab === 'clubs' ? 'CLUB' : 'PROJECT';

      // Inbox shows only entities the user belongs to (no staff "all clubs" bypass).
      const apps = await prisma.application.findMany({
        where: {
          userId: me,
          status: 'APPROVED',
          ...(kind === 'CLUB' ? { clubId: { not: null } } : { projectId: { not: null } }),
        },
        select: { clubId: true, projectId: true },
      });
      const entityIds = apps
        .map((a) => (kind === 'CLUB' ? a.clubId : a.projectId))
        .filter((id): id is string => Boolean(id));

      if (entityIds.length === 0) {
        return NextResponse.json({ tab, conversations: [] });
      }

      const conversations = await prisma.conversation.findMany({
        where: {
          kind,
          ...(kind === 'CLUB' ? { clubId: { in: entityIds } } : { projectId: { in: entityIds } }),
        },
        select: {
          id: true,
          kind: true,
          clubId: true,
          projectId: true,
          updatedAt: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              senderId: true,
              body: true,
              kind: true,
              metaJson: true,
              readAt: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              messages: { where: { senderId: { not: me }, readAt: null } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });

      const titles =
        kind === 'CLUB'
          ? await prisma.club.findMany({
              where: { id: { in: entityIds } },
              select: { id: true, title: true, image: true },
            })
          : await prisma.project.findMany({
              where: { id: { in: entityIds } },
              select: { id: true, title: true, image: true },
            });
      const titleById = new Map(titles.map((t) => [t.id, t]));

      const states = await prisma.conversationUserState.findMany({
        where: { userId: me, conversationId: { in: conversations.map((c) => c.id) } },
        select: { conversationId: true, pinnedAt: true, archivedAt: true, mutedAt: true },
      });
      const stateById = new Map(states.map((s) => [s.conversationId, s]));

      const mapped = conversations
        .map((row) => {
          const entityId = kind === 'CLUB' ? row.clubId! : row.projectId!;
          const entity = titleById.get(entityId);
          const st = stateById.get(row.id);
          const archived = Boolean(st?.archivedAt);
          if (archived !== showArchived) return null;
          return {
            id: row.id,
            kind,
            entityId,
            title: entity?.title || (kind === 'CLUB' ? 'Клуб' : 'Проект'),
            image: entity?.image || null,
            href:
              kind === 'CLUB'
                ? `/clubs/${encodeRouteParam(entityId)}`
                : `/projects/${encodeRouteParam(entityId)}`,
            lastMessage: row.messages[0]
              ? {
                  ...row.messages[0],
                  preview: previewForMessage(
                    row.messages[0].kind,
                    row.messages[0].body,
                    row.messages[0].metaJson
                  ),
                }
              : null,
            unreadCount: row._count.messages,
            updatedAt: row.updatedAt,
            pinned: Boolean(st?.pinnedAt),
            archived,
            muted: Boolean(st?.mutedAt),
          };
        })
        .filter(Boolean);

      // Also surface memberships without an existing Conversation row
      const knownEntityIds = new Set(
        mapped.map((m) => (m as { entityId: string }).entityId)
      );
      const missing = entityIds
        .filter((id) => !knownEntityIds.has(id) && !showArchived)
        .map((entityId) => {
          const entity = titleById.get(entityId);
          return {
            id: null as string | null,
            kind,
            entityId,
            title: entity?.title || (kind === 'CLUB' ? 'Клуб' : 'Проект'),
            image: entity?.image || null,
            href:
              kind === 'CLUB'
                ? `/clubs/${encodeRouteParam(entityId)}`
                : `/projects/${encodeRouteParam(entityId)}`,
            lastMessage: null,
            unreadCount: 0,
            updatedAt: new Date(0).toISOString(),
            pinned: false,
            archived: false,
            needsBootstrap: true,
          };
        });

      const existing = mapped.filter(Boolean) as Array<{
        id: string;
        kind: string;
        entityId: string;
        title: string;
        image: string | null;
        href: string;
        lastMessage: unknown;
        unreadCount: number;
        updatedAt: Date | string;
        pinned: boolean;
        archived: boolean;
      }>;
      let all = sortByPinThenUpdated([...existing, ...missing]);
      if (q) {
        all = all.filter((c) => {
          const row = c as { title?: string; lastMessage?: { preview?: string; body?: string } | null };
          const title = (row.title || "").toLowerCase();
          const preview = ((row.lastMessage && row.lastMessage.preview) || (row.lastMessage && row.lastMessage.body) || "").toLowerCase();
          return title.includes(q) || preview.includes(q);
        });
      }
      return NextResponse.json({ tab, conversations: all });
    }

    // personal DM tab
    const rows = await prisma.conversation.findMany({
      where: {
        OR: [{ pairKey: { startsWith: `${me}_` } }, { pairKey: { endsWith: `_${me}` } }],
        kind: 'DM',
      },
      select: {
        id: true,
        pairKey: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            senderId: true,
            body: true,
            kind: true,
            metaJson: true,
            readAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: { senderId: { not: me }, readAt: null },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const validRows = rows.filter((row) => {
      const otherId = otherUserIdFromPair(row.pairKey, me);
      return Boolean(otherId) && conversationPairKey(me, otherId) === row.pairKey;
    });

    const states = await prisma.conversationUserState.findMany({
      where: { userId: me, conversationId: { in: validRows.map((r) => r.id) } },
      select: { conversationId: true, pinnedAt: true, archivedAt: true, mutedAt: true },
    });
    const stateById = new Map(states.map((s) => [s.conversationId, s]));

    const filtered = validRows.filter((row) => {
      const archived = Boolean(stateById.get(row.id)?.archivedAt);
      return showArchived ? archived : !archived;
    });

    const otherIds = filtered.map((row) => otherUserIdFromPair(row.pairKey, me));
    const users = await prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: {
        id: true,
        publicCode: true,
        name: true,
        nickname: true,
        image: true,
        profileVisibility: true,
        lastActiveAt: true,
        onlineVisibility: true,
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    const conversations = (
      await Promise.all(
        filtered.map(async (row) => {
          const raw = usersById.get(otherUserIdFromPair(row.pairKey, me));
          if (!raw) return null;
          const user = resolvePublicIdentity({
            target: {
              id: raw.id,
              name: raw.nickname || raw.name,
              image: raw.image,
              profileVisibility: raw.profileVisibility,
            },
            viewerId: me,
            isFriend: true,
          });
          const presence = await resolvePresenceForViewer({
            viewerId: me,
            targetId: raw.id,
            targetLastActiveAt: raw.lastActiveAt,
            targetOnlineVisibility: raw.onlineVisibility,
            targetProfileVisibility: raw.profileVisibility,
            isFriend: true,
          });
          const st = stateById.get(row.id);
          return {
            id: row.id,
            kind: 'DM' as const,
            user: {
              id: user.id,
              publicCode: raw.publicCode,
              name: user.name,
              image: user.image,
            },
            lastMessage: row.messages[0]
              ? {
                  ...row.messages[0],
                  preview: previewForMessage(
                    row.messages[0].kind,
                    row.messages[0].body,
                    row.messages[0].metaJson
                  ),
                }
              : null,
            unreadCount: row._count.messages,
            updatedAt: row.updatedAt,
            presence,
            pinned: Boolean(st?.pinnedAt),
            archived: Boolean(st?.archivedAt),
            muted: Boolean(st?.mutedAt),
          };
        })
      )
    ).filter(Boolean);

    let personalList = sortByPinThenUpdated(conversations.filter(Boolean) as Array<{
      pinned?: boolean;
      updatedAt: Date | string;
      user?: { name?: string | null };
      lastMessage?: { preview?: string; body?: string } | null;
    }>);
    if (q) {
      personalList = personalList.filter((c) => {
        const name = (c.user?.name || "").toLowerCase();
        const preview = (c.lastMessage?.preview || c.lastMessage?.body || "").toLowerCase();
        return name.includes(q) || preview.includes(q);
      });
    }
    return NextResponse.json({
      tab,
      conversations: personalList,
    });
  } catch (error) {
    console.error('GET /api/messages', error);
    return NextResponse.json({ message: 'Ошибка загрузки диалогов' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user?.id;
    if (!me) return unauthorized();

    const meUser = await prisma.user.findUnique({
      where: { id: me },
      select: { blockedAt: true, blockedReason: true, reliabilityScore: true },
    });
    if (meUser?.blockedAt) {
      return NextResponse.json(
        { message: meUser.blockedReason || 'Аккаунт заблокирован. Сообщения недоступны.' },
        { status: 403 }
      );
    }

    const access = await getAccessSettings();
    const myRole = session?.user?.role || '';

    const cfg = await getModerationConfig();
    const { userMessagingLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
    const boost = await userMessagingLimitMultiplier(session.user.id);
    const perMin = boostedMax(cfg.rateLimits.perMinute, boost);
    const perHour = boostedMax(cfg.rateLimits.perHour, boost);

    if (
      !(await messagePerMinuteLimiter.checkAsync(`msg-m:${me}`, perMin)) ||
      !(await messagePerHourLimiter.checkAsync(`msg-h:${me}`, perHour))
    ) {
      return NextResponse.json(
        rateLimitJson(
          `Слишком много сообщений. Подождите немного (лимит: ${perMin}/мин, ${perHour}/час).`
        ),
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';

    if (!userId || !body) {
      return NextResponse.json({ message: 'Получатель и текст обязательны' }, { status: 400 });
    }
    if (userId === me) {
      return NextResponse.json({ message: 'Нельзя отправить сообщение себе' }, { status: 400 });
    }
    if (body.length > cfg.maxMessageLength) {
      return NextResponse.json(
        { message: `Сообщение не должно превышать ${cfg.maxMessageLength} символов` },
        { status: 400 }
      );
    }

    if (cfg.minMessageIntervalMs > 0) {
      const recent = await prisma.directMessage.findFirst({
        where: {
          senderId: me,
          createdAt: { gte: new Date(Date.now() - cfg.minMessageIntervalMs) },
        },
        select: { id: true },
      });
      if (recent) {
        return NextResponse.json(
          rateLimitJson('Слишком быстро. Подождите секунду перед следующим сообщением.'),
          { status: 429 }
        );
      }
    }

    const safety = cfg.enabled
      ? scanUnsafeContent(body)
      : {
          flagged: false as const,
          maskedText: body,
          categories: [] as import('@/lib/censor').SafetyCategory[],
          matches: [] as string[],
          hits: [] as import('@/lib/censor').SafetyHit[],
          maxSeverity: 0,
          reliabilityDelta: 0,
        };

    const [recipient, sender, friends] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findUnique({
        where: { id: me },
        select: { name: true },
      }),
      areFriends(me, userId),
    ]);
    if (!recipient) {
      return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
    }

    const staffInvolved = isStaffRole(myRole) || isStaffRole(recipient.role);
    if (!friends && !staffInvolved) {
      return NextResponse.json(
        { message: 'Личные сообщения доступны только друзьям' },
        { status: 403 }
      );
    }

    if (!access.messagingEnabled && !staffInvolved) {
      return NextResponse.json(
        {
          message:
            'Режим тишины: переписка между пользователями временно отключена. Написать можно администрации или модератору.',
        },
        { status: 403 }
      );
    }

    const displayBody = safety.flagged ? safety.maskedText : body;

    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { pairKey: conversationPairKey(me, userId) },
        create: { pairKey: conversationPairKey(me, userId), kind: 'DM' },
        update: {},
      });
      const message = await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: me,
          body: displayBody,
          kind: 'TEXT',
          flagged: safety.flagged,
        },
        select: {
          id: true,
          senderId: true,
          body: true,
          kind: true,
          metaJson: true,
          flagged: true,
          readAt: true,
          createdAt: true,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      const mute = await tx.conversationUserState.findUnique({
        where: { userId_conversationId: { userId, conversationId: conversation.id } },
        select: { mutedAt: true },
      });
      if (!mute?.mutedAt) {
        await tx.userNotification.create({
          data: {
            userId,
            type: 'MESSAGE',
            title: 'Новое сообщение',
            body: `${sender?.name || 'Друг'}: ${displayBody.slice(0, 160)}`,
            meta: JSON.stringify({
              conversationId: conversation.id,
              senderId: me,
              href: `/messages?with=${me}`,
            }),
          },
        });
      }
      return { conversationId: conversation.id, message, mutedNotify: Boolean(mute?.mutedAt) };
    });

    let warning: string | null = null;
    if (safety.flagged) {
      const mod = await moderateDirectMessage({
        messageId: result.message.id,
        conversationId: result.conversationId,
        senderId: me,
        originalBody: body,
        scan: safety,
      });
      warning = mod.warning;
      result.message.body = mod.body;
    }

    await evaluateAchievements(me);
    if (!result.mutedNotify) {
      void import('@/lib/web-push')
        .then(({ pushForNotification }) =>
          pushForNotification({
            userId,
            type: 'MESSAGE',
            title: 'Новое сообщение',
            body: `${sender?.name || 'Друг'}: ${displayBody.slice(0, 160)}`,
            meta: { href: `/messages?with=${me}`, conversationId: result.conversationId, senderId: me },
          })
        )
        .catch(() => null);
    }

    return NextResponse.json({ ...result, warning }, { status: 201 });
  } catch (error) {
    if (error instanceof ProfanityError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/messages', error);
    return NextResponse.json({ message: 'Не удалось отправить сообщение' }, { status: 500 });
  }
}
