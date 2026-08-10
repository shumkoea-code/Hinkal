/**
 * Bot channel settings (MAX / Telegram) stored in SiteSettings.botsConfigJson.
 */
import { prisma } from '@/lib/prisma';

export type BotChannelNotify = {
  applications: boolean;
  bookings: boolean;
  moderation: boolean;
  portfolio: boolean;
};

export type BotChannelConfig = {
  notify: BotChannelNotify;
  /** Custom welcome after /start (empty = default) */
  welcomeText: string;
  /** Quiet hours MSK inclusive start (0–23); null = off */
  quietFrom: number | null;
  quietTo: number | null;
  /** MAX webhook update types */
  updateTypes: string[];
};

export type BotsConfig = {
  max: BotChannelConfig;
  telegram: BotChannelConfig;
};

export const DEFAULT_BOT_NOTIFY: BotChannelNotify = {
  applications: true,
  bookings: true,
  moderation: true,
  portfolio: true,
};

export const DEFAULT_MAX_UPDATE_TYPES = [
  'message_created',
  'message_callback',
  'bot_started',
];

export const DEFAULT_BOT_CHANNEL: BotChannelConfig = {
  notify: { ...DEFAULT_BOT_NOTIFY },
  welcomeText: '',
  quietFrom: null,
  quietTo: null,
  updateTypes: [...DEFAULT_MAX_UPDATE_TYPES],
};

export const DEFAULT_BOTS_CONFIG: BotsConfig = {
  max: { ...DEFAULT_BOT_CHANNEL, updateTypes: [...DEFAULT_MAX_UPDATE_TYPES] },
  telegram: {
    ...DEFAULT_BOT_CHANNEL,
    updateTypes: [],
  },
};

function clampHour(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(23, Math.round(n)));
}

function parseChannel(raw: unknown, withTypes: boolean): BotChannelConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const n = (o.notify && typeof o.notify === 'object' ? o.notify : {}) as Record<string, unknown>;
  const types = Array.isArray(o.updateTypes)
    ? o.updateTypes.map(String).filter(Boolean)
    : withTypes
      ? [...DEFAULT_MAX_UPDATE_TYPES]
      : [];
  return {
    notify: {
      applications: n.applications !== false,
      bookings: n.bookings !== false,
      moderation: n.moderation !== false,
      portfolio: n.portfolio !== false,
    },
    welcomeText: typeof o.welcomeText === 'string' ? o.welcomeText.slice(0, 2000) : '',
    quietFrom: clampHour(o.quietFrom),
    quietTo: clampHour(o.quietTo),
    updateTypes: types,
  };
}

export function parseBotsConfig(raw: string | null | undefined): BotsConfig {
  if (!raw) return structuredClone(DEFAULT_BOTS_CONFIG);
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      max: parseChannel(j.max, true),
      telegram: parseChannel(j.telegram, false),
    };
  } catch {
    return structuredClone(DEFAULT_BOTS_CONFIG);
  }
}

export function serializeBotsConfig(cfg: BotsConfig): string {
  return JSON.stringify(cfg);
}

export async function getBotsConfig(): Promise<BotsConfig> {
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  return parseBotsConfig((s as { botsConfigJson?: string | null } | null)?.botsConfigJson);
}

export async function saveBotsConfig(cfg: BotsConfig): Promise<BotsConfig> {
  const clean: BotsConfig = {
    max: parseChannel(cfg.max, true),
    telegram: parseChannel(cfg.telegram, false),
  };
  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: { botsConfigJson: serializeBotsConfig(clean) },
    create: { id: '1', botsConfigJson: serializeBotsConfig(clean) },
  });
  return clean;
}

/** Moscow hour 0–23 */
export function moscowHourNow(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === 'hour')?.value || '0');
}

/** Quiet window can wrap midnight (e.g. 22→7). */
export function isQuietHour(channel: BotChannelConfig, hour = moscowHourNow()): boolean {
  const from = channel.quietFrom;
  const to = channel.quietTo;
  if (from == null || to == null) return false;
  if (from === to) return true; // full-day mute
  if (from < to) return hour >= from && hour < to;
  return hour >= from || hour < to;
}

export async function botNotifyAllowed(
  channel: 'max' | 'telegram',
  kind: keyof BotChannelNotify
): Promise<boolean> {
  const cfg = await getBotsConfig();
  const ch = cfg[channel];
  if (!ch.notify[kind]) return false;
  if (isQuietHour(ch)) return false;
  return true;
}
