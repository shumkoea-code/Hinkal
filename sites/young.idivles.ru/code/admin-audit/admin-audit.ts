import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

export type AdminAuditInput = {
  actorId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetEmail?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function clientIpFromHeaders(h?: Headers): Promise<string | null> {
  try {
    const hdrs = h || (await headers());
    const xf = hdrs.get('x-forwarded-for') || '';
    return xf.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
  } catch {
    return null;
  }
}

export async function logAdminAction(input: AdminAuditInput): Promise<void> {
  try {
    let ip = input.ip ?? null;
    let userAgent = input.userAgent ?? null;
    if (!ip || !userAgent) {
      try {
        const h = await headers();
        ip = ip || (await clientIpFromHeaders(h));
        userAgent = userAgent || h.get('user-agent');
      } catch {
        /* non-request context */
      }
    }
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorEmail: input.actorEmail || null,
        actorRole: input.actorRole || null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId || null,
        targetEmail: input.targetEmail || null,
        ip,
        userAgent,
        detail: input.detail ? JSON.stringify(input.detail) : null,
      },
    });
  } catch (e) {
    console.error('[AdminAuditLog] failed', e);
  }
}

export function generateTempPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
