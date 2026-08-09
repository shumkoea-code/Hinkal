import { NextRequest, NextResponse } from 'next/server';
import {
  getTelegramConfig,
  telegramWebhookSecret,
  tgAnswerCallback,
  tgSendMessage,
} from '@/lib/telegram';
import { applyTelegramDecision, sendPendingQueue } from '@/lib/telegram-moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, service: 'telegram-webhook' });
}

export async function POST(req: NextRequest) {
  const c = await getTelegramConfig();
  if (!c.token || !c.enabled) {
    return NextResponse.json({ ok: false, reason: 'disabled' });
  }

  const headerSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  const expected = telegramWebhookSecret(c.token);
  if (headerSecret !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Record<string, any> = {};
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (cb?.id) {
    const data = String(cb.data || '');
    const fromId = cb.from?.id;
    const chatId = cb.message?.chat?.id ?? fromId;
    const messageId = cb.message?.message_id;
    const m = data.match(/^(app|book):(ok|no):([A-Za-z0-9_-]+)$/);
    if (!m) {
      await tgAnswerCallback(cb.id, 'Неизвестная команда', c.token, true);
      return NextResponse.json({ ok: true });
    }
    const result = await applyTelegramDecision({
      kind: m[1] as 'app' | 'book',
      id: m[3],
      approve: m[2] === 'ok',
      actorChatId: fromId,
      chatId,
      messageId,
    });
    await tgAnswerCallback(cb.id, result.message, c.token, !result.ok);
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true });
  const text = String(msg.text || '').trim();
  const chatId = msg.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  if (/^\/start(?:@\w+)?\b/i.test(text)) {
    await tgSendMessage(
      String(chatId),
      `Ваш Telegram chat ID: <code>${chatId}</code>\n\n` +
        `1) Укажите его в профиле на сайте (поле «Telegram chat ID»).\n` +
        `2) Или админ добавит его в Настройки → Оповещения.\n\n` +
        `<b>Команды</b>\n` +
        `/pending — очередь заявок и броней с кнопками\n` +
        `/help — справка`,
      { token: c.token }
    );
    return NextResponse.json({ ok: true });
  }

  if (/^\/help(?:@\w+)?\b/i.test(text)) {
    await tgSendMessage(
      String(chatId),
      `<b>Модерация в Telegram</b>\n\n` +
        `Новые заявки и брони приходят сюда с кнопками <b>Одобрить / Отклонить</b>.\n` +
        `/pending — показать текущую очередь\n` +
        `/start — ваш chat ID для привязки\n\n` +
        `Решение сразу обновляет статус на сайте и уведомляет пользователя.`,
      { token: c.token }
    );
    return NextResponse.json({ ok: true });
  }

  if (/^\/pending(?:@\w+)?\b/i.test(text)) {
    await sendPendingQueue(chatId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
