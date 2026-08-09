import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, chmod } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getTelegramConfig, tgSendMessage } from '@/lib/telegram';

/** Exact magic phrase for full project+DB backup via Telegram. */
export const TG_BACKUP_PHRASE = 'Абракадабра, Евгений Шумко!';

/** Reveal password for the latest encrypted backup (authorized admin only). */
export const TG_BACKUP_PASSWORD_PHRASE = 'Шумко Евгений, дай пароль!';

const REQUEST_DIR = path.join(process.cwd(), 'data', 'backup-requests');
const PASSWORD_DIR = path.join(REQUEST_DIR, 'password-requests');
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min

function normalizePhrase(text: string) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[!！]+$/g, '!')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTelegramBackupPhrase(text: string) {
  return normalizePhrase(text) === TG_BACKUP_PHRASE;
}

export function isTelegramBackupPasswordPhrase(text: string) {
  return normalizePhrase(text) === TG_BACKUP_PASSWORD_PHRASE;
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
  try {
    await chmod(dir, 0o775);
  } catch {
    /* ignore */
  }
}

export async function isAuthorizedBackupChat(chatId: string | number): Promise<boolean> {
  const id = String(chatId);
  const c = await getTelegramConfig();
  if (c.ids.map(String).includes(id)) return true;

  try {
    const s = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { dailyBackupChatId: true },
    });
    if (s?.dailyBackupChatId && String(s.dailyBackupChatId) === id) return true;
  } catch {
    /* ignore */
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

    await ensureDir(REQUEST_DIR);
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
      '🪄 <b>Абракадабра принята.</b>\n' +
        'Собираю и <b>шифрую</b> полный бэкап (AES-256). Файлы пришлю сюда в течение минуты.\n' +
        'Пароль отдельно — командой:\n<code>Шумко Евгений, дай пароль!</code>'
    );

    return { ok: true as const, id };
  } catch (e) {
    console.error('[tg-backup] enqueue failed', e);
    try {
      await tgSendMessage(
        chatId,
        '❌ Не удалось поставить бэкап в очередь (ошибка записи на сервере).'
      );
    } catch {
      /* ignore */
    }
    return { ok: false as const, reason: 'error' as const };
  }
}

/** Queue a host-side reveal of the latest backup password (vault is root-only). */
export async function enqueueBackupPasswordReveal(opts: {
  chatId: string | number;
  fromUserId?: string | number | null;
  fromUsername?: string | null;
}) {
  const chatId = String(opts.chatId);
  try {
    if (!(await isAuthorizedBackupChat(chatId))) {
      await tgSendMessage(chatId, '⛔ Пароль бэкапа доступен только авторизованному админу.');
      return { ok: false as const, reason: 'forbidden' as const };
    }

    await ensureDir(PASSWORD_DIR);
    const id = randomUUID();
    const payload = {
      id,
      chatId,
      kind: 'password-reveal',
      fromUserId: opts.fromUserId != null ? String(opts.fromUserId) : null,
      fromUsername: opts.fromUsername || null,
      requestedAt: new Date().toISOString(),
    };
    await writeFile(path.join(PASSWORD_DIR, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
    await tgSendMessage(
      chatId,
      '🔐 Запрос пароля принят. Пришлю актуальный пароль от последнего бэкапа в течение минуты.'
    );
    return { ok: true as const, id };
  } catch (e) {
    console.error('[tg-backup] password enqueue failed', e);
    try {
      await tgSendMessage(chatId, '❌ Не удалось запросить пароль. Повторите чуть позже.');
    } catch {
      /* ignore */
    }
    return { ok: false as const, reason: 'error' as const };
  }
}
