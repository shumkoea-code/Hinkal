import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, chmod } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getTelegramConfig, tgSendMessage } from '@/lib/telegram';

/** Exact magic phrase for full project+DB backup via Telegram. */
export const TG_BACKUP_PHRASE = 'Абракадабра, Евгений Шумко!';

const REQUEST_DIR = path.join(process.cwd(), 'data', 'backup-requests');
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min

function normalizePhrase(text: string) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[!！]+$/g, '!') // tolerate fullwidth bang
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTelegramBackupPhrase(text: string) {
  return normalizePhrase(text) === TG_BACKUP_PHRASE;
}

async function ensureDir() {
  await mkdir(REQUEST_DIR, { recursive: true });
  try {
    await chmod(REQUEST_DIR, 0o775);
  } catch {
    /* ignore */
  }
}

export async function isAuthorizedBackupChat(chatId: string | number): Promise<boolean> {
  const id = String(chatId);
  const c = await getTelegramConfig();
  if (c.ids.map(String).includes(id)) return true;

  // Daily-backup recipient is always allowed to request Abracadabra too
  try {
    const s = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { dailyBackupChatId: true },
    });
    if (s?.dailyBackupChatId && String(s.dailyBackupChatId) === id) return true;
  } catch {
    /* column may be missing mid-migrate */
  }

  const admin = await prisma.user.findFirst({
    where: {
      role: 'ADMIN',
      deletedAt: null,
      OR: [{ telegramChatId: id }, { telegramChatId: String(Number(id) || id) }],
    },
    select: { id: true },
  });
  return Boolean(admin);
}

async function lastRequestAt(): Promise<number> {
  try {
    const raw = await readFile(path.join(REQUEST_DIR, '.last'), 'utf8');
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function enqueueTelegramBackup(opts: {
  chatId: string | number;
  fromUserId?: string | number | null;
  fromUsername?: string | null;
  kind?: string;
  skipCooldown?: boolean;
}) {
  const chatId = String(opts.chatId);
  try {
    if (!(await isAuthorizedBackupChat(chatId))) {
      await tgSendMessage(
        chatId,
        '⛔ Команда доступна только авторизованным администраторам оповещений.\n' +
          'Добавьте ваш chat ID в Настройки → Оповещения или привяжите Telegram в профиле ADMIN.'
      );
      return { ok: false as const, reason: 'forbidden' as const };
    }

    const now = Date.now();
    if (!opts.skipCooldown) {
      const last = await lastRequestAt();
      if (now - last < COOLDOWN_MS) {
        const mins = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);
        await tgSendMessage(
          chatId,
          `⏳ Бэкап уже запрашивали недавно. Повторите через ~${mins} мин.`
        );
        return { ok: false as const, reason: 'cooldown' as const };
      }
    }

    await ensureDir();
    const id = randomUUID();
    const payload = {
      id,
      chatId,
      kind: opts.kind || 'abracadabra',
      fromUserId: opts.fromUserId != null ? String(opts.fromUserId) : null,
      fromUsername: opts.fromUsername || null,
      phraseHash: createHash('sha256').update(TG_BACKUP_PHRASE).digest('hex').slice(0, 16),
      requestedAt: new Date().toISOString(),
    };
    await writeFile(path.join(REQUEST_DIR, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
    await writeFile(path.join(REQUEST_DIR, '.last'), String(now), 'utf8');
    await writeFile(path.join(REQUEST_DIR, '.pending'), id, 'utf8');

    await tgSendMessage(
      chatId,
      '🪄 <b>Абракадабра принята.</b>\nСобираю полный бэкап проекта и баз данных — пришлю файлы сюда в течение минуты.'
    );

    return { ok: true as const, id };
  } catch (e) {
    console.error('[tg-backup] enqueue failed', e);
    try {
      await tgSendMessage(
        chatId,
        '❌ Не удалось поставить бэкап в очередь (ошибка записи на сервере). Техслужба уведомлена в логах.'
      );
    } catch {
      /* ignore */
    }
    return { ok: false as const, reason: 'error' as const };
  }
}
