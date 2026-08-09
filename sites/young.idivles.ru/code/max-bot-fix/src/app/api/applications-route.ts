import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { profanityResponse } from '@/lib/censor';
import { AclError, aclJsonError, requireEndUser } from '@/lib/acl';
import { applicationHourLimiter, rateLimitJson } from '@/lib/rateLimit';
import { programIsApplyOpen } from '@/lib/programs';

export async function POST(req: Request) {
  try {
    const session = await requireEndUser();
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }

    const { userApplicationLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
    const { getUserCapabilities, AUTHORITY } = await import('@/lib/reputation');
    const caps = await getUserCapabilities(userId);
    if (!caps.canApply) {
      return NextResponse.json(
        {
          message: `Авторитет слишком низкий для заявок (нужно ≥ ${AUTHORITY.APPLICATION_MIN}%, сейчас ${caps.authority}%).`,
        },
        { status: 403 }
      );
    }
    const appMax = boostedMax(10, await userApplicationLimitMultiplier(userId));
    if (!await applicationHourLimiter.checkAsync(`app:${userId}`, appMax)) {
      return NextResponse.json(
        rateLimitJson(`Слишком много заявок. Попробуйте позже (лимит: ${appMax} в час).`),
        { status: 429 }
      );
    }

    const body = await req.json();
    const { projectId, clubId, programId, message } = body;

    const targets = [projectId, clubId, programId].filter(Boolean);
    if (targets.length !== 1) {
      return NextResponse.json(
        { message: 'Укажите один объект заявки: проект, клуб или программу' },
        { status: 400 }
      );
    }

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (!project || project.status === 'INACTIVE' || project.status === 'COMPLETED') {
        return NextResponse.json({ message: 'Проект недоступен для заявок' }, { status: 400 });
      }
    }
    if (clubId) {
      const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { status: true },
      });
      if (!club || club.status === 'INACTIVE' || club.status === 'COMPLETED') {
        return NextResponse.json({ message: 'Клуб недоступен для заявок' }, { status: 400 });
      }
    }
    if (programId) {
      const program = await prisma.portalProgram.findUnique({
        where: { id: programId },
        select: { status: true, endsAt: true, seats: true },
      });
      if (!program || !programIsApplyOpen(program.status, program.endsAt)) {
        return NextResponse.json({ message: 'Набор в эту программу закрыт' }, { status: 400 });
      }
      if (typeof program.seats === 'number') {
        const approved = await prisma.application.count({
          where: { programId, status: 'APPROVED' },
        });
        if (approved >= program.seats) {
          return NextResponse.json({ message: 'Свободных мест больше нет' }, { status: 400 });
        }
      }
    }

    const msg = typeof message === 'string' ? message.trim().slice(0, 2000) : null;
    const dirty = profanityResponse(msg);
    if (dirty) return dirty;

    const application = await prisma.$transaction(async (tx) => {
      const existing = await tx.application.findFirst({
        where: {
          userId,
          ...(programId ? { programId } : clubId ? { clubId } : { projectId }),
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        if (existing.status === 'PENDING' || existing.status === 'APPROVED') {
          const err = new Error('EXISTS');
          (err as Error & { status?: string }).status = existing.status;
          throw err;
        }
        return tx.application.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            message: msg || null,
          },
        });
      }

      return tx.application.create({
        data: {
          userId,
          projectId: projectId || null,
          clubId: clubId || null,
          programId: programId || null,
          message: msg || null,
          status: 'PENDING',
        },
      });
    });

    const { evaluateAchievements } = await import('@/lib/award-achievements');
    await evaluateAchievements(userId).catch(() => null);

    try {
      const { notifyStaffTelegramNewApplication } = await import('@/lib/telegram-moderation');
      void notifyStaffTelegramNewApplication(application.id).catch((e) =>
        console.warn('notifyStaffTelegramNewApplication', e)
      );
      try {
        const { notifyStaffMaxNewApplication } = await import('@/lib/max-moderation');
        void notifyStaffMaxNewApplication(application.id).catch((e) =>
          console.warn('notifyStaffMaxNewApplication', e)
        );
      } catch (e) {
        console.warn('notifyStaffMaxNewApplication import', e);
      }
    } catch (e) {
      console.warn('notifyStaffTelegramNewApplication import', e);
    }

    return NextResponse.json({ message: 'Заявка успешно подана', application }, { status: 201 });
  } catch (error) {
    if (error instanceof AclError) return aclJsonError(error);
    if (error instanceof Error && error.message === 'EXISTS') {
      const status = (error as Error & { status?: string }).status;
      return NextResponse.json(
        {
          message:
            status === 'APPROVED'
              ? 'Вы уже участник'
              : 'Вы уже подали заявку. Ожидайте ответа администратора.',
          status,
        },
        { status: 400 }
      );
    }
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json(
        { message: 'Вы уже подали заявку. Ожидайте ответа администратора.' },
        { status: 400 }
      );
    }
    console.error('Ошибка при подаче заявки:', error);
    return NextResponse.json({ message: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
