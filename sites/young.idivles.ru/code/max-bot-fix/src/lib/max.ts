/**
 * MAX Bot API client (platform-api2.max.ru).
 *
 * Critical rules (from MAX docs + production pitfalls):
 * - Authorization header = raw bot token (not Bearer)
 * - DM 1-to-1 → query `user_id`; group/channel → `chat_id`
 * - TLS needs MinCifry root (NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca.pem)
 * - Webhook subscription auto-drops after ~8h without HTTP 200 — re-register on save/boot
 */
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

export const MAX_API = process.env.MAX_API_BASE || 'https://platform-api2.max.ru';

export type MaxConfig = {
  token: string;
  secret: string;
  ids: string[];
  enabled: boolean;
};

export type MaxSendResult = {
  ok: boolean;
  status?: number;
  body?: string;
  reason?: string;
};

export async function maxGetConfig(): Promise<MaxConfig> {
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  return {
    token: s?.maxBotToken || process.env.MAX_BOT_TOKEN || '',
    secret: s?.maxWebhookSecret || '',
    ids: (s?.maxAlertChatIds || '')
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    enabled: s?.maxBotEnabled ?? false,
  };
}

async function maxFetch(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<{ ok: boolean; status: number; text: string; json: unknown }> {
  const token = init.token || (await maxGetConfig()).token;
  if (!token) return { ok: false, status: 0, text: 'no-token', json: null };
  const { token: _t, ...rest } = init;
  try {
    const res = await fetch(`${MAX_API}${path}`, {
      ...rest,
      headers: {
        Authorization: token,
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers || {}),
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  } catch (e) {
    return { ok: false, status: 0, text: String(e), json: null };
  }
}

export async function maxGetMe(token?: string) {
  const r = await maxFetch('/me', { token });
  return r;
}

/**
 * Send a message. Prefer `userId` for personal dialogs.
 * Falls back: if only one numeric target is given as string, try user_id first then chat_id.
 */
export async function maxSendMessage(
  to: { userId?: string | number | null; chatId?: string | number | null } | string | number,
  text: string,
  opts?: {
    token?: string;
    format?: 'markdown' | 'html';
    attachments?: unknown[];
    notify?: boolean;
  }
): Promise<MaxSendResult> {
  const token = opts?.token || (await maxGetConfig()).token;
  if (!token) return { ok: false, reason: 'no-token' };

  let userId: string | undefined;
  let chatId: string | undefined;
  if (typeof to === 'string' || typeof to === 'number') {
    userId = String(to);
  } else {
    if (to.userId != null && to.userId !== '') userId = String(to.userId);
    if (to.chatId != null && to.chatId !== '') chatId = String(to.chatId);
  }
  if (!userId && !chatId) return { ok: false, reason: 'no-recipient' };

  const body: Record<string, unknown> = { text: String(text || '').slice(0, 4000) };
  if (opts?.format) body.format = opts.format;
  if (opts?.attachments) body.attachments = opts.attachments;
  if (opts?.notify === false) body.notify = false;

  const trySend = async (qs: string) => {
    const r = await maxFetch(`/messages?${qs}`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
    return {
      ok: r.ok,
      status: r.status,
      body: r.text,
      reason: r.ok ? undefined : extractReason(r.json, r.text),
    } satisfies MaxSendResult;
  };

  // Prefer user_id for DMs (MAX does not treat personal dialogs as chats).
  if (userId) {
    const r = await trySend(`user_id=${encodeURIComponent(userId)}`);
    if (r.ok) return r;
    // If dialog missing and we also have chatId, try chat.
    if (chatId && /dialog\.not\.found|chat\.not\.found/i.test(r.reason || '')) {
      return trySend(`chat_id=${encodeURIComponent(chatId)}`);
    }
    // Legacy: alert list may accidentally hold a group chat id
    if (!chatId && /dialog\.not\.found|chat\.not\.found/i.test(r.reason || '')) {
      const asChat = await trySend(`chat_id=${encodeURIComponent(userId)}`);
      if (asChat.ok) return asChat;
      return r;
    }
    return r;
  }

  return trySend(`chat_id=${encodeURIComponent(chatId!)}`);
}

function extractReason(json: unknown, text: string): string {
  if (json && typeof json === 'object') {
    const o = json as { code?: string; message?: string };
    if (o.code || o.message) return [o.code, o.message].filter(Boolean).join(': ');
  }
  return text.slice(0, 240) || 'error';
}

/** Broadcast to configured alert user ids (and optional override list). */
export async function maxSend(text: string, userIds?: string[]) {
  const c = await maxGetConfig();
  if (!c.token) return { ok: false as const, reason: 'no-token' as const, sent: 0, total: 0, errors: [] as string[] };
  if (!userIds && !c.enabled) {
    return { ok: false as const, reason: 'disabled' as const, sent: 0, total: 0, errors: [] as string[] };
  }
  const ids = userIds && userIds.length ? userIds : c.ids;
  if (!ids.length) {
    return { ok: false as const, reason: 'no-recipients' as const, sent: 0, total: 0, errors: [] as string[] };
  }
  const errors: string[] = [];
  let sent = 0;
  for (const id of ids) {
    const r = await maxSendMessage({ userId: id }, text, { token: c.token });
    if (r.ok) sent += 1;
    else errors.push(`${id}: ${r.reason || r.status}`);
  }
  return { ok: sent > 0, sent, total: ids.length, errors, reason: sent ? undefined : errors[0] };
}

export function maxCallbackKeyboard(
  rows: { text: string; payload: string }[][]
): unknown[] {
  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: rows.map((row) =>
          row.map((b) => ({
            type: 'callback',
            text: b.text.slice(0, 64),
            payload: b.payload.slice(0, 128),
          }))
        ),
      },
    },
  ];
}

export function maxLinkKeyboard(text: string, url: string): unknown[] {
  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: [[{ type: 'link', text: text.slice(0, 64), url }]],
      },
    },
  ];
}

/** Register webhook; replaces previous subscriptions for this bot. */
export async function maxSetWebhook(url: string, secret?: string, token?: string) {
  const c = await maxGetConfig();
  const tok = token || c.token;
  if (!tok) return { ok: false as const, reason: 'no-token' as const };
  const sec = (secret ?? c.secret) || '';

  // Drop existing subscriptions so we don't stack stale URLs
  try {
    const cur = await maxFetch('/subscriptions', { token: tok });
    const list =
      cur.json && typeof cur.json === 'object'
        ? ((cur.json as { subscriptions?: { url?: string }[] }).subscriptions || [])
        : [];
    for (const sub of list) {
      if (!sub?.url) continue;
      await maxFetch(`/subscriptions?url=${encodeURIComponent(sub.url)}`, {
        method: 'DELETE',
        token: tok,
      });
    }
  } catch {
    /* best-effort */
  }

  const payload: Record<string, unknown> = {
    url,
    update_types: ['message_created', 'message_callback', 'bot_started'],
  };
  if (sec) payload.secret = sec;

  const res = await maxFetch('/subscriptions', {
    method: 'POST',
    token: tok,
    body: JSON.stringify(payload),
  });
  return {
    ok: res.ok,
    status: res.status,
    body: res.text,
    reason: res.ok ? undefined : extractReason(res.json, res.text),
  };
}

export async function maxListSubscriptions(token?: string) {
  return maxFetch('/subscriptions', { token });
}

/** Ensure webhook secret exists in DB; returns secret. */
export async function maxEnsureWebhookSecret(): Promise<string> {
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const existing = (s as { maxWebhookSecret?: string | null } | null)?.maxWebhookSecret;
  if (existing && existing.length >= 16) return existing;
  const secret = randomBytes(24).toString('hex');
  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: { maxWebhookSecret: secret },
    create: { id: '1', maxWebhookSecret: secret },
  });
  return secret;
}

export async function maxEnsureWebhook(publicOrigin?: string) {
  const c = await maxGetConfig();
  if (!c.token || !c.enabled) {
    return { ok: false as const, reason: 'disabled-or-no-token' as const };
  }
  const secret = await maxEnsureWebhookSecret();
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const base = (
    publicOrigin ||
    (settings as { publicSiteUrl?: string | null } | null)?.publicSiteUrl ||
    process.env.NEXTAUTH_URL ||
    'https://young.idivles.ru'
  ).replace(/\/$/, '');
  const url = `${base}/api/integrations/max/webhook`;
  return maxSetWebhook(url, secret, c.token);
}
