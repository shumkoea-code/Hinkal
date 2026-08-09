import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfanityError, scanUnsafeContent } from '@/lib/censor';
import { moderateDirectMessage } from '@/lib/content-moderation';
import { getModerationConfig } from '@/lib/moderation-settings';
import { entityPairKey, hasEntityAccess, type EntityKind } from '@/lib/entity-access';
import {
  messagePerHourLimiter,
  messagePerMinuteLimiter,
  placesReadRateLimiter,
  rateLimitJson,
} from '@/lib/rateLimit';

function parseKind(raw: unknown): EntityKind | null {
  const k = String(raw || '').toUpperCase();
  if (k === 'PROJECT' || k === 'CLUB') return k;
  return null;
}

function formatMessage(
  row: {
    id: string;
    senderId: string;
    body: string;
    flagged: boolean;
    createdAt: Date;
    sender: { name: string | null; nickname: string | null; image: string | null };
  }
) {
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender.nickname || row.sender.name || 'Участник',
    senderImage: row.sender.image,
    body: row.body,
    flagged: row.flagged,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveEntity(kind: EntityKind, entityId: string) {
  if (kind === 'PROJECT') {
    return prisma.project.findUnique({
      where: { id: entityId },
      select: { id: true, title: true, status: true },
    });
  }
  return prisma.club.findUnique({
    where: { id: entityId },
    select: { id: true, title: true, status: true },
  });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    if (!(await placesReadRateLimiter.checkAsync(`gchat-r:${userId}`))) {
      return NextResponse.json(rateLimitJson('Слишком много запросов к чату. Подождите минуту.'), {
        status: 429,
      });
    }

    const url = new URL(req.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const entityId = String(url.searchParams.get('entityId') || '').trim();

    if (!kind || !entityId) {
      return NextResponse.json({ message: 'Укажите kind и entityId' }, { status: 400 });
    }

    const entity = await resolveEntity(kind, entityId);
    if (!entity || entity.status === 'INACTIVE') {
      return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
    }

    const allowed = await hasEntityAccess(userId, null, kind, entityId);
    if (!allowed) {
      return NextResponse.json({ message: 'Чат доступен только участникам' }, { status: 403 });
    }

    const pairKey = entityPairKey(kind, entityId);
    const conversation = await prisma.conversation.upsert({
      where: { pairKey },
      create: {
        pairKey,
        kind,
        projectId: kind === 'PROJECT' ? entityId : null,
        clubId: kind === 'CLUB' ? entityId : null,
      },
      update: {},
      select: { id: true },
    });

    const rows = await prisma.directMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 80,
      select: {
        id: true,
        senderId: true,
        body: true,
        flagged: true,
        createdAt: true,
        sender: { select: { name: true, nickname: true, image: true } },
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      entityTitle: entity.title,
      messages: rows.map(formatMessage),
    });
  } catch (e) {
    console.error('GET /api/group-chat', e);
    return NextResponse.json({ message: 'Ошибка загрузки чата' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const meUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { blockedAt: true, blockedReason: true },
    });
    if (meUser?.blockedAt) {
      return NextResponse.json(
        { message: meUser.blockedReason || 'Аккаунт заблокирован. Сообщения недоступны.' },
        { status: 403 }
      );
    }

    const cfg = await getModerationConfig();
    const { userMessagingLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
    const boost = await userMessagingLimitMultiplier(userId);
    const perMin = boostedMax(cfg.rateLimits.perMinute, boost);
    const perHour = boostedMax(cfg.rateLimits.perHour, boost);

    if (
      !(await messagePerMinuteLimiter.checkAsync(`gchat-m:${userId}`, perMin)) ||
      !(await messagePerHourLimiter.checkAsync(`gchat-h:${userId}`, perHour))
    ) {
      return NextResponse.json(
        rateLimitJson(`Слишком много сообщений (лимит: ${perMin}/мин, ${perHour}/час).`),
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const kind = parseKind(payload.kind);
    const entityId = String(payload.entityId || '').trim();
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';

    if (!kind || !entityId || !body) {
      return NextResponse.json({ message: 'Укажите kind, entityId и текст' }, { status: 400 });
    }
    if (body.length > cfg.maxMessageLength) {
      return NextResponse.json(
        { message: `Сообщение не должно превышать ${cfg.maxMessageLength} символов` },
        { status: 400 }
      );
    }

    const entity = await resolveEntity(kind, entityId);
    if (!entity || entity.status === 'INACTIVE') {
      return NextResponse.json({ message: 'Не найдено' }, { status: 404 });
    }

    const allowed = await hasEntityAccess(userId, null, kind, entityId);
    if (!allowed) {
      return NextResponse.json({ message: 'Чат доступен только участникам' }, { status: 403 });
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

    const displayBody = safety.flagged ? safety.maskedText : body;
    const pairKey = entityPairKey(kind, entityId);

    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { pairKey },
        create: {
          pairKey,
          kind,
          projectId: kind === 'PROJECT' ? entityId : null,
          clubId: kind === 'CLUB' ? entityId : null,
        },
        update: { updatedAt: new Date() },
        select: { id: true },
      });

      const message = await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          body: displayBody,
          kind: 'TEXT',
          flagged: safety.flagged,
        },
        select: {
          id: true,
          senderId: true,
          body: true,
          flagged: true,
          createdAt: true,
          sender: { select: { name: true, nickname: true, image: true } },
        },
      });

      return { conversationId: conversation.id, message };
    });

    let warning: string | null = null;
    if (safety.flagged) {
      const mod = await moderateDirectMessage({
        messageId: result.message.id,
        conversationId: result.conversationId,
        senderId: userId,
        originalBody: body,
        scan: safety,
      });
      warning = mod.warning;
      result.message.body = mod.body;
    }

    return NextResponse.json(
      {
        conversationId: result.conversationId,
        message: formatMessage(result.message),
        warning,
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof ProfanityError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    console.error('POST /api/group-chat', e);
    return NextResponse.json({ message: 'Не удалось отправить сообщение' }, { status: 500 });
  }
}
