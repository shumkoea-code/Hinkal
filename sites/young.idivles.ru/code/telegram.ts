import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

async function cfg() {
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  return {
    token: s?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '',
    ids: (s?.telegramAlertChatIds || '')
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    enabled: s?.telegramAlertsEnabled ?? false,
  };
}

export function telegramWebhookSecret(token: string) {
  return createHash('sha256').update(`${token}:yp-tg-hook`).digest('hex').slice(0, 32);
}

export async function telegramConfigured() {
  return !!(await cfg()).token;
}

export async function getTelegramConfig() {
  return cfg();
}

type InlineButton = { text: string; callback_data?: string; url?: string };
export type TelegramReplyMarkup = { inline_keyboard: InlineButton[][] };

async function api(token: string, method: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    };
    return { ok: !!json.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { description: String(e) } };
  }
}

export async function tgSendRaw(token: string, chatId: string, text: string): Promise<boolean> {
  const r = await api(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  return r.ok;
}

export async function tgSendMessage(
  chatId: string,
  text: string,
  opts?: { reply_markup?: TelegramReplyMarkup; token?: string }
) {
  const c = await cfg();
  const token = opts?.token || c.token;
  if (!token) return { ok: false as const, reason: 'no-token' as const };
  return api(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function tgEditMessage(
  chatId: string,
  messageId: number,
  text: string,
  opts?: { reply_markup?: TelegramReplyMarkup; token?: string }
) {
  const c = await cfg();
  const token = opts?.token || c.token;
  if (!token) return { ok: false as const };
  return api(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function tgAnswerCallback(
  callbackQueryId: string,
  text?: string,
  token?: string,
  showAlert = false
) {
  const c = await cfg();
  const tok = token || c.token;
  if (!tok) return { ok: false as const };
  return api(tok, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || '',
    show_alert: showAlert,
  });
}

/** Send to explicit chatIds, or (when omitted) to configured alert recipients if enabled. */
export async function tgSend(
  text: string,
  chatIds?: string[],
  reply_markup?: TelegramReplyMarkup
) {
  const c = await cfg();
  if (!c.token) return { ok: false, reason: 'no-token' as const };
  if (!chatIds && !c.enabled) return { ok: false, reason: 'disabled' as const };
  const ids = chatIds && chatIds.length ? chatIds : c.ids;
  if (!ids.length) return { ok: false, reason: 'no-recipients' as const };
  const results = await Promise.all(
    ids.map((id) =>
      api(c.token, 'sendMessage', {
        chat_id: id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(reply_markup ? { reply_markup } : {}),
      })
    )
  );
  const sent = results.filter((r) => r.ok).length;
  return { ok: sent > 0, sent, total: ids.length };
}

export async function tgSetWebhook(url: string) {
  const c = await cfg();
  if (!c.token) return { ok: false, reason: 'no-token' as const, json: null };
  const secret = telegramWebhookSecret(c.token);
  return api(c.token, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}

export function decisionKeyboard(kind: 'app' | 'book', id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Одобрить', callback_data: `${kind}:ok:${id}` },
        { text: '❌ Отклонить', callback_data: `${kind}:no:${id}` },
      ],
    ],
  };
}

export function openAdminKeyboard(path: string, origin: string): TelegramReplyMarkup {
  const url = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  return {
    inline_keyboard: [[{ text: 'Открыть в админке', url }]],
  };
}
