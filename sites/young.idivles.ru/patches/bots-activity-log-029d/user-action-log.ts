/**
 * Unified user activity log (mutations & security-relevant events).
 * Never store passwords, tokens, or full message bodies.
 */
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { clientIpFromHeaders } from '@/lib/admin-audit';
import {
  ACTION_LABELS_RU,
  type UserActionCategory,
} from '@/lib/user-action-log-shared';

export type { UserActionCategory } from '@/lib/user-action-log-shared';
export { ACTION_LABELS_RU, CATEGORY_LABELS_RU } from '@/lib/user-action-log-shared';

export type UserActionInput = {
  userId?: string | null;
  userEmail?: string | null;
  userCode?: string | null;
  action: string;
  category: UserActionCategory;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
  detail?: Record<string, unknown> | null;
  success?: boolean;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

const SENSITIVE_KEYS = /pass(word)?|token|secret|cookie|authorization|csrf|fingerprint/i;

function scrubDetail(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = '[скрыто]';
      continue;
    }
    if (typeof v === 'string' && v.length > 400) out[k] = `${v.slice(0, 400)}…`;
    else out[k] = v;
  }
  try {
    return JSON.stringify(out).slice(0, 4000);
  } catch {
    return null;
  }
}

export async function logUserAction(input: UserActionInput): Promise<void> {
  try {
    let ip = input.ip ?? null;
    let userAgent = input.userAgent ?? null;
    let path = input.path ?? null;
    if (!ip || !userAgent || !path) {
      try {
        const h = await headers();
        ip = ip || (await clientIpFromHeaders(h));
        userAgent = userAgent || h.get('user-agent');
        path = path || h.get('x-invoke-path') || h.get('x-matched-path') || null;
      } catch {
        /* non-request */
      }
    }

    let userEmail = input.userEmail ?? null;
    let userCode = input.userCode ?? null;
    if (input.userId && (!userEmail || !userCode)) {
      const u = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, publicCode: true },
      });
      userEmail = userEmail || u?.email || null;
      userCode = userCode || u?.publicCode || null;
    }

    await prisma.userActionLog.create({
      data: {
        userId: input.userId || null,
        userEmail,
        userCode,
        action: String(input.action).slice(0, 64),
        category: String(input.category).slice(0, 32),
        targetType: input.targetType || null,
        targetId: input.targetId || null,
        summary: (input.summary || ACTION_LABELS_RU[input.action] || input.action).slice(0, 240),
        detail: scrubDetail(input.detail),
        success: input.success !== false,
        path: path ? String(path).slice(0, 240) : null,
        ip,
        userAgent: userAgent ? String(userAgent).slice(0, 400) : null,
      },
    });
  } catch (e) {
    console.error('[UserActionLog] failed', e);
  }
}

/** Fire-and-forget wrapper */
export function voidLogUserAction(input: UserActionInput): void {
  void logUserAction(input).catch(() => undefined);
}
