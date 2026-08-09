import { NextResponse } from 'next/server';
import { requirePermission, aclJsonError } from '@/lib/acl';
import { prisma } from '@/lib/prisma';
import { drawRaffleWinners, syncRaffleEntriesFromCheckIns } from '@/lib/contest-raffle';
import { bumpEcoPoints, grantEcoPoints, ECO } from '@/lib/eco-points';
import { bumpSocialScore } from '@/lib/reputation';
import { evaluateAchievements } from '@/lib/award-achievements';
import { createUserNotification } from '@/lib/security';

export async function GET() {
  try {
    await requirePermission('contests');
    const contests = await prisma.contest.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: {
        booking: { select: { id: true, title: true } },
        _count: { select: { submissions: true, raffleEntries: true, winners: true } },
      },
    });
    const pendingSubs = await prisma.contestSubmission.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, publicCode: true } },
        contest: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json({ contests, pendingSubs });
  } catch (e) {
    return aclJsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission('contests');
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'upsertContest') {
      const id = body.id ? String(body.id) : null;
      const data = {
        kind: String(body.kind || 'SUBMISSION'),
        title: String(body.title || '').trim(),
        summary: body.summary ? String(body.summary) : null,
        rulesHtml: String(body.rulesHtml || '<p></p>'),
        prizeText: body.prizeText ? String(body.prizeText) : null,
        status: String(body.status || 'DRAFT'),
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        voteEndsAt: body.voteEndsAt ? new Date(body.voteEndsAt) : null,
        allowVoting: body.allowVoting !== false,
        maxSubmissionsPerUser: Number(body.maxSubmissionsPerUser || 1),
        bookingId: body.bookingId ? String(body.bookingId) : null,
        winnerCount: Number(body.winnerCount || 1),
        eligibilityJson: body.eligibility ? JSON.stringify(body.eligibility) : null,
      };
      if (!data.title) return NextResponse.json({ message: 'Название обязательно' }, { status: 400 });
      const row = id
        ? await prisma.contest.update({ where: { id }, data })
        : await prisma.contest.create({ data });
      return NextResponse.json({ contest: row });
    }

    if (action === 'reviewSubmission') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      if (!['APPROVED', 'REJECTED'].includes(status)) {
        return NextResponse.json({ message: 'Статус?' }, { status: 400 });
      }
      const row = await prisma.contestSubmission.update({
        where: { id },
        data: {
          status,
          rejectReason: body.rejectReason ? String(body.rejectReason) : null,
        },
      });
      if (status === 'APPROVED') {
        await bumpEcoPoints(row.userId, ECO.CONTEST_APPROVED || 12, 'contest_approved', {
          submissionId: row.id,
        }).catch(() => null);
        await bumpSocialScore(row.userId, 2, 'contest_approved').catch(() => null);
        await evaluateAchievements(row.userId).catch(() => null);
      }
      return NextResponse.json({ submission: row });
    }

    if (action === 'syncRaffle') {
      const contestId = String(body.contestId || '');
      const result = await syncRaffleEntriesFromCheckIns(contestId);
      return NextResponse.json(result);
    }

    if (action === 'drawRaffle') {
      const contestId = String(body.contestId || '');
      const result = await drawRaffleWinners(contestId, session.user.id);
      for (const userId of result.winners) {
        await bumpEcoPoints(userId, ECO.RAFFLE_WIN || 40, 'raffle_win', { contestId }).catch(() => null);
        await bumpSocialScore(userId, 3, 'raffle_win').catch(() => null);
        await evaluateAchievements(userId).catch(() => null);
        await createUserNotification({
          userId,
          type: 'CONTEST',
          title: 'Вы выиграли розыгрыш!',
          body: 'Поздравляем — проверьте раздел конкурсов',
          meta: { href: `/contests/${contestId}` },
        }).catch(() => null);
      }
      return NextResponse.json(result);
    }

    if (action === 'declareSubmissionWinners') {
      const contestId = String(body.contestId || '');
      const top = await prisma.contestSubmission.findMany({
        where: { contestId, status: 'APPROVED' },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
        take: Number(body.count || 3),
      });
      for (let i = 0; i < top.length; i++) {
        await prisma.contestWinner.upsert({
          where: { contestId_userId: { contestId, userId: top[i].userId } },
          create: {
            contestId,
            userId: top[i].userId,
            place: i + 1,
            drawnById: session.user.id,
          },
          update: { place: i + 1, drawnById: session.user.id },
        });
        await bumpEcoPoints(top[i].userId, ECO.CONTEST_WIN || 35, 'contest_win', {
          contestId,
          place: i + 1,
        }).catch(() => null);
        await bumpSocialScore(top[i].userId, 4, 'contest_win').catch(() => null);
        await evaluateAchievements(top[i].userId).catch(() => null);
      }
      await prisma.contest.update({
        where: { id: contestId },
        data: { status: 'CLOSED', drawnAt: new Date() },
      });
      return NextResponse.json({ winners: top.map((t) => t.userId) });
    }

    if (action === 'awardEco') {
      const contestId = String(body.contestId || '').trim();
      const amount = Math.floor(Number(body.amount || 0));
      let userId = String(body.userId || '').trim();
      const publicCode = String(body.publicCode || '').trim();
      const reason = String(body.reason || 'contest_manual_award').slice(0, 200);

      if (!contestId) {
        return NextResponse.json({ message: 'contestId обязателен' }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
        return NextResponse.json({ message: 'Сумма 1–5000' }, { status: 400 });
      }

      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        select: { id: true, title: true },
      });
      if (!contest) {
        return NextResponse.json({ message: 'Конкурс не найден' }, { status: 404 });
      }

      if (!userId && publicCode) {
        const u = await prisma.user.findFirst({
          where: {
            OR: [{ publicCode: publicCode.toUpperCase() }, { publicCode }],
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!u) return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
        userId = u.id;
      }
      if (!userId) {
        return NextResponse.json({ message: 'Укажите userId или publicCode' }, { status: 400 });
      }

      const result = await grantEcoPoints(userId, amount, reason, {
        contestId,
        byAdminId: session.user.id,
        manual: true,
      });
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: 400 });
      }

      await createUserNotification({
        userId,
        type: 'CONTEST',
        title: `+${amount} эко за конкурс`,
        body: `Награда по конкурсу «${contest.title}»`,
        meta: { href: `/contests/${contestId}` },
      }).catch(() => null);

      return NextResponse.json({ ok: true, ecoPoints: result.ecoPoints });
    }

    return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    return aclJsonError(e);
  }
}
