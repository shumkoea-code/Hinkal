import { NextResponse } from 'next/server';
import { requireAdmin, aclJsonError } from '@/lib/acl';
import {
  maxGetConfig,
  maxGetMe,
  maxEnsureWebhook,
  maxEnsureWebhookSecret,
  maxListSubscriptions,
  maxSend,
  maxSendMessage,
} from '@/lib/max';

export async function GET() {
  try {
    await requireAdmin();
    const cfg = await maxGetConfig();
    const me = cfg.token ? await maxGetMe(cfg.token) : null;
    const subs = cfg.token ? await maxListSubscriptions(cfg.token) : null;
    return NextResponse.json({
      enabled: cfg.enabled,
      hasToken: Boolean(cfg.token),
      hasSecret: Boolean(cfg.secret),
      alertIds: cfg.ids,
      me: me?.ok ? me.json : { error: me?.text },
      subscriptions: subs?.ok ? subs.json : { error: subs?.text },
      apiBase: process.env.MAX_API_BASE || 'https://platform-api2.max.ru',
    });
  } catch (e) {
    return aclJsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const action = String((body as { action?: string }).action || '');

    if (action === 'ensureWebhook') {
      const secret = await maxEnsureWebhookSecret();
      const r = await maxEnsureWebhook();
      return NextResponse.json({ ...r, hasSecret: Boolean(secret) });
    }

    if (action === 'test') {
      const userId = String((body as { userId?: string }).userId || '').trim();
      const text =
        String((body as { text?: string }).text || '').trim() ||
        '✅ Тест MAX с young.idivles.ru';
      if (userId) {
        const r = await maxSendMessage({ userId }, text);
        return NextResponse.json(r);
      }
      const r = await maxSend(text);
      return NextResponse.json(r);
    }

    if (action === 'me') {
      const r = await maxGetMe();
      return NextResponse.json(r);
    }

    return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return aclJsonError(e);
  }
}
