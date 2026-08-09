import { requireAdmin, requireAdminPage } from '@/lib/acl';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { tgSend, tgSetWebhook } from '@/lib/telegram';
import { maxSend, maxSetWebhook } from '@/lib/max';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { sendEmail } from '@/lib/email';
import Link from 'next/link';
import {
  Mail, Shield, Settings2, Share2, Globe,
  CheckCircle2, AlertTriangle,
  Database, Calendar, Building2, Zap, Construction, Scale, Landmark, ShieldAlert, Bell,
  Leaf, Server,
} from 'lucide-react';
import DemoSettingsPanel from '@/components/DemoSettingsPanel';
import AdminReplicaClient, { AdminEcoPoolPanel } from '@/components/admin/AdminReplicaClient';
import SettingsVkSync from '@/components/SettingsVkSync';
import LogoImageField from '@/components/admin/LogoImageField';
import SettingsSaveBar from '@/components/admin/SettingsSaveBar';
import { saveUploadedImage, saveUploadedVideo } from '@/lib/uploads';
import { DEFAULT_LOGO } from '@/components/SiteBrand';
import {
  DEFAULT_GOV_WIDGETS,
  parseGovWidgetsJson,
  serializeGovWidgets,
  type GovWidget,
  type GovWidgetKind,
} from '@/lib/gov-widgets';
import {
  DEFAULT_MODERATION_CONFIG,
  parseModerationConfig,
  serializeModerationConfig,
} from '@/lib/moderation-config';

export const dynamic = 'force-dynamic';

async function testEmail(formData: FormData) {
  'use server';
  await requireAdmin();
  const testTo = formData.get('testTo') as string;
  if (!testTo) return;
  const { getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName } = await getSiteIdentity();
  await sendEmail(testTo, `Проверка почты — ${siteName}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem;background:#f9f9f9;border-radius:12px;">
      <h1 style="color:#3b82f6">✅ Почта работает!</h1>
      <p>Если вы видите это письмо — настройки почты корректны и письма доходят до адресата.</p>
      <p style="color:#94a3b8;font-size:0.85rem">Отправлено с панели настроек ${siteName}</p>
    </div>
  `);
}

async function updateSettings(formData: FormData) {
  'use server';
  await requireAdmin();
  const { assertCleanText } = await import('@/lib/censor');

  const tab = (formData.get('settingsTab') as string) || 'general';
  const data: Record<string, unknown> = {};

  const str = (key: string) => {
    if (!formData.has(key)) return;
    data[key] = formData.get(key) as string;
  };

  if (tab === 'general') {
    // Persist portal activity gallery toggles from the General tab (UI lives here)
    data.galleryHomepageEnabled = formData.get('galleryHomepageEnabled') === 'true';
    data.galleryPageEnabled = formData.get('galleryPageEnabled') === 'true';
    data.galleryPublicEnabled = formData.get('galleryPublicEnabled') === 'true';
    const orgGallery = String(formData.get('orgGalleryJson') || '').trim();
    data.orgGalleryJson = orgGallery || null;
    const maxUser = parseInt(String(formData.get('galleryMaxPerUser') || ''), 10);
    if (Number.isFinite(maxUser) && maxUser > 0) data.galleryMaxPerUser = Math.min(48, maxUser);
    const maxBytes = parseInt(String(formData.get('galleryMaxUploadBytes') || ''), 10);
    if (Number.isFinite(maxBytes) && maxBytes > 0) {
      data.galleryMaxUploadBytes = Math.min(15 * 1024 * 1024, Math.max(256 * 1024, maxBytes));
    }
    data.siteName = (formData.get('siteName') as string) || 'Центр развития молодежи Сочи';
    data.publicEventsVisibility = formData.get('publicEventsVisibility') === 'true';
    data.heroAnimationMode = (formData.get('heroAnimationMode') as string) === 'static' ? 'static' : 'animated';
    const publicSiteUrl = ((formData.get('publicSiteUrl') as string) || '').trim();
    data.publicSiteUrl = publicSiteUrl || null;
    const logoFile = formData.get('logoFile') as File | null;
    const existingLogo = ((formData.get('logoUrl') as string) || '').trim();
    if (logoFile && logoFile.size > 0) {
      data.logoUrl = await saveUploadedImage(logoFile, 'brand', {
        fallbackUrl: existingLogo || DEFAULT_LOGO,
        preset: 'logo',
      });
    } else if (formData.has('logoUrl')) {
      // Cleared → null (SiteBrand falls back to default); otherwise keep
      data.logoUrl = existingLogo || null;
    }
    const heroFile = formData.get('heroFile') as File | null;
    const existingHero = ((formData.get('heroImageUrl') as string) || '').trim();
    if (heroFile && heroFile.size > 0) {
      data.heroImageUrl = await saveUploadedImage(heroFile, 'brand', {
        fallbackUrl: existingHero || '/brand/hero-cover.jpg',
        preset: 'hero',
      });
    } else if (formData.has('heroImageUrl')) {
      data.heroImageUrl = existingHero || null;
    }
    const heroVideoFile = formData.get('heroVideoFile') as File | null;
    const existingHeroVideo = ((formData.get('heroVideoUrl') as string) || '').trim();
    if (heroVideoFile && heroVideoFile.size > 0) {
      data.heroVideoUrl = await saveUploadedVideo(heroVideoFile, 'brand', existingHeroVideo || '/brand/hero-cover.mp4');
    } else if (formData.has('heroVideoUrl')) {
      data.heroVideoUrl = existingHeroVideo || null;
    }
  } else if (tab === 'appearance') {
    str('contactEmail');
    str('supportEmail');
    str('contactPhone');
    str('address');
    const openT = String(formData.get('contactsOpenTime') || '').trim();
    const closeT = String(formData.get('contactsCloseTime') || '').trim();
    const days = String(formData.get('contactsWorkDays') || 'пн–пт').trim().slice(0, 40);
    if (/^\d{1,2}:\d{2}$/.test(openT) && /^\d{1,2}:\d{2}$/.test(closeT)) {
      data.bookingOpenTime = openT.length === 4 ? `0${openT}` : openT;
      data.bookingCloseTime = closeT.length === 4 ? `0${closeT}` : closeT;
      // normalize HH:MM
      const norm = (v: string) => {
        const [h, m] = v.split(':');
        return `${String(Math.min(23, parseInt(h, 10))).padStart(2, '0')}:${m}`;
      };
      data.bookingOpenTime = norm(openT);
      data.bookingCloseTime = norm(closeT);
      data.workHours = `${days}, ${data.bookingOpenTime}–${data.bookingCloseTime} (МСК)`;
    } else {
      str('workHours');
    }
  } else if (tab === 'social') {
    for (const id of ['vk', 'tg', 'ok', 'whatsapp', 'rutube', 'max']) {
      data[`${id}Link`] = (formData.get(`${id}Link`) as string) || '';
      data[`${id}Enabled`] = formData.get(`${id}Enabled`) === 'true';
    }
  } else if (tab === 'access') {
    data.publicEventsVisibility = formData.get('publicEventsVisibility') === 'true';
    data.registrationEnabled = formData.get('registrationEnabled') === 'true';
    data.messagingEnabled = formData.get('messagingEnabled') === 'true';
  } else if (tab === 'maintenance') {
    data.maintenanceMode = formData.get('maintenanceMode') === 'true';
    data.maintenanceMessage = ((formData.get('maintenanceMessage') as string) || '').trim();
    data.maintenanceEta = ((formData.get('maintenanceEta') as string) || '').trim() || null;
  } else if (tab === 'smtp') {
    str('smtpHost');
    data.smtpPort = parseInt(formData.get('smtpPort') as string) || 465;
    str('smtpUser');
    str('smtpFrom');
    const smtpPass = formData.get('smtpPass') as string;
    if (smtpPass && smtpPass.trim()) data.smtpPass = smtpPass;
  } else if (tab === 'vk-api') {
    data.vkSyncEnabled = formData.get('vkSyncEnabled') === 'true';
    const tokenRaw = ((formData.get('vkApiToken') as string) || '').trim();
    if (tokenRaw) data.vkApiToken = tokenRaw;
    const { normalizeVkGroupId, vkGroupPublicUrl } = await import('@/lib/vk-group');
    const { parseVkSyncSchedule, serializeVkSyncSchedule } = await import('@/lib/vk-sync-schedule');
    const rawGroup = ((formData.get('vkGroupId') as string) || '').trim();
    const groupId = normalizeVkGroupId(rawGroup);
    data.vkGroupId = groupId || null;
    const publicUrl = vkGroupPublicUrl(groupId);
    if (publicUrl) {
      data.vkLink = publicUrl;
      if (data.vkSyncEnabled) data.vkEnabled = true;
    }
    const scheduleRaw = ((formData.get('vkSyncScheduleJson') as string) || '').trim();
    if (scheduleRaw) {
      data.vkSyncScheduleJson = serializeVkSyncSchedule(parseVkSyncSchedule(scheduleRaw));
    }
  } else if (tab === 'booking') {
    data.minBookingHours = parseInt(formData.get('minBookingHours') as string) || 3;
    data.autoApproveBookings = formData.get('autoApproveBookings') === 'true';
    data.reminderHoursBefore = parseInt(formData.get('reminderHoursBefore') as string) || 24;
    str('bookingOpenTime');
    str('bookingCloseTime');
    const openT = String(formData.get('bookingOpenTime') || '09:00').trim();
    const closeT = String(formData.get('bookingCloseTime') || '21:00').trim();
    if (/^\d{1,2}:\d{2}$/.test(openT) && /^\d{1,2}:\d{2}$/.test(closeT)) {
      const prev = await prisma.siteSettings.findUnique({ where: { id: '1' }, select: { workHours: true } });
      const dayPart = String(prev?.workHours || 'пн–пт').split(',')[0]?.trim() || 'пн–пт';
      data.workHours = `${dayPart}, ${openT}–${closeT} (МСК)`;
    }
  } else if (tab === 'analytics') {
    data.yandexMetrikaId = ((formData.get('yandexMetrikaId') as string) || '').trim() || null;
  } else if (tab === 'legal') {
    data.copyProtectionEnabled = formData.get('copyProtectionEnabled') === 'true';
    data.cookieBannerEnabled = formData.get('cookieBannerEnabled') === 'true';
    data.analyticsConsentRequired = formData.get('analyticsConsentRequired') === 'true';
    data.operatorName = ((formData.get('operatorName') as string) || '').trim() || null;
    data.operatorInn = ((formData.get('operatorInn') as string) || '').trim() || null;
    data.operatorOgrn = ((formData.get('operatorOgrn') as string) || '').trim() || null;
    data.pdnResponsibleEmail = ((formData.get('pdnResponsibleEmail') as string) || '').trim() || null;
  } else if (tab === 'gov') {
    data.govWidgetsEnabled = formData.get('govWidgetsEnabled') === 'true';
    data.govWidgetsTitle =
      ((formData.get('govWidgetsTitle') as string) || '').trim() || 'Государственные сервисы';
    const widgets: GovWidget[] = DEFAULT_GOV_WIDGETS.map((def) => {
      const kindRaw = (formData.get(`gov_${def.id}_kind`) as string) || def.kind;
      const kind: GovWidgetKind = kindRaw === 'iframe' ? 'iframe' : 'link';
      return {
        id: def.id,
        title: ((formData.get(`gov_${def.id}_title`) as string) || def.title).trim().slice(0, 120),
        enabled: formData.get(`gov_${def.id}_enabled`) === 'true',
        kind,
        url: ((formData.get(`gov_${def.id}_url`) as string) || '').trim().slice(0, 2000),
        note: ((formData.get(`gov_${def.id}_note`) as string) || '').trim().slice(0, 400),
      };
    });
    data.govWidgetsJson = serializeGovWidgets(widgets);
  } else if (tab === 'moderation') {
    const cfg = parseModerationConfig(null);
    cfg.enabled = formData.get('modEnabled') === 'true';
    cfg.notifyOnActioned = formData.get('modNotifyActioned') === 'true';
    cfg.notifyOnDismissed = formData.get('modNotifyDismissed') === 'true';
    cfg.maxMessageLength = parseInt(String(formData.get('modMaxLength') || ''), 10) || DEFAULT_MODERATION_CONFIG.maxMessageLength;
    cfg.rateLimits.perMinute = parseInt(String(formData.get('modPerMinute') || ''), 10) || DEFAULT_MODERATION_CONFIG.rateLimits.perMinute;
    cfg.rateLimits.perHour = parseInt(String(formData.get('modPerHour') || ''), 10) || DEFAULT_MODERATION_CONFIG.rateLimits.perHour;
    cfg.autoBlockWarnThreshold = Math.max(
      0,
      parseInt(String(formData.get('modAutoBlock') || ''), 10) || 0
    );
    cfg.minMessageIntervalMs = Math.max(
      0,
      parseInt(String(formData.get('modMinInterval') || ''), 10) || 0
    );
    data.moderationConfigJson = serializeModerationConfig(parseModerationConfig(JSON.stringify(cfg)));
    const cooldownRaw = parseInt(String(formData.get('portfolioSubmitCooldownDays') || ''), 10);
    data.portfolioSubmitCooldownDays = Number.isFinite(cooldownRaw)
      ? Math.max(0, Math.min(365, cooldownRaw))
      : 7;
  }

  if (tab === 'notifications') {
    const norm = (v: string) => v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).join(',');
    const tgTok = String(formData.get('telegramBotToken') || '').trim();
    if (tgTok) data.telegramBotToken = tgTok;
    data.telegramAlertChatIds = norm(String(formData.get('telegramAlertChatIds') || '')) || null;
    data.telegramAlertsEnabled = formData.get('telegramAlertsEnabled') === 'true';
    data.dailyBackupEnabled = formData.get('dailyBackupEnabled') === 'true';
    const dailyChat = String(formData.get('dailyBackupChatId') || '').trim();
    data.dailyBackupChatId = dailyChat || null;
    const dh = parseInt(String(formData.get('dailyBackupHour') || ''), 10);
    data.dailyBackupHour = Number.isFinite(dh) ? Math.max(0, Math.min(23, dh)) : 3;
    const mxTok = String(formData.get('maxBotToken') || '').trim();
    if (mxTok) data.maxBotToken = mxTok;
    const mxSec = String(formData.get('maxWebhookSecret') || '').trim();
    if (mxSec) data.maxWebhookSecret = mxSec;
    data.maxAlertChatIds = norm(String(formData.get('maxAlertChatIds') || '')) || null;
    data.maxBotEnabled = formData.get('maxBotEnabled') === 'true';
  }

  try {
    assertCleanText(
      String(data.siteName || ''),
      String(data.address || ''),
      String(data.contactPhone || ''),
      String(data.maintenanceMessage || ''),
      String(data.maintenanceEta || ''),
      String(data.operatorName || ''),
      String(data.govWidgetsTitle || '')
    );
    await prisma.siteSettings.upsert({
      where:  { id: '1' },
      update: data,
      create: { id: '1', ...data },
    });

    if (tab === 'maintenance' && data.maintenanceMode === true) {
      try {
        const { createUserNotification } = await import('@/lib/security');
        const staff = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'MODERATOR'] }, deletedAt: null, blockedAt: null },
          select: { id: true },
          take: 40,
        });
        await Promise.all(
          staff.map((u) =>
            createUserNotification({
              userId: u.id,
              type: 'SYSTEM',
              title: 'Режим обслуживания включён',
              body: 'Посетители видят заглушку. Вход для сотрудников: /login?staff=1',
              meta: { href: '/admin/settings?tab=maintenance' },
            })
          )
        );
      } catch (e) {
        console.warn('maintenance notify', e);
      }
    }

    revalidatePath('/admin/settings');
    revalidatePath('/');
    revalidatePath('/contacts');
    revalidatePath('/maintenance');
    revalidatePath('/privacy');
    revalidatePath('/rules');
    revalidatePath('/events');
    revalidatePath('/news');
    revalidatePath('/projects');
    revalidatePath('/clubs');
    revalidatePath('/spaces');
    revalidatePath('/documents');
    revalidatePath('/manifest.webmanifest');
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    console.error('Ошибка сохранения настроек', e);
    throw e;
  }

  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=${encodeURIComponent(tab)}&saved=1`);
}

async function testTelegram(formData: FormData) {
  'use server';
  await requireAdmin();
  const token = String(formData.get('telegramBotToken') || '').trim();
  const ids = String(formData.get('telegramAlertChatIds') || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  let ok = false;
  if (token && ids.length) {
    const { tgSendRaw } = await import('@/lib/telegram');
    for (const id of ids) { ok = (await tgSendRaw(token, id, '\u2705 \u0422\u0435\u0441\u0442: Telegram-\u043e\u043f\u043e\u0432\u0435\u0449\u0435\u043d\u0438\u044f \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442.')) || ok; }
  } else {
    const r = await tgSend('\u2705 \u0422\u0435\u0441\u0442: Telegram-\u043e\u043f\u043e\u0432\u0435\u0449\u0435\u043d\u0438\u044f \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442.', ids.length ? ids : undefined);
    ok = r.ok;
  }
  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=notifications&tg=${ok ? 'ok' : 'fail'}`);
}

async function testMaxAlert() {
  'use server';
  await requireAdmin();
  const r = await maxSend('\u2705 \u0422\u0435\u0441\u0442: MAX-\u043e\u043f\u043e\u0432\u0435\u0449\u0435\u043d\u0438\u044f \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442.');
  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=notifications&max=${r.ok ? 'ok' : 'fail'}`);
}

async function attachMyTelegram() {
  'use server';
  await requireAdmin();
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const me = uid ? await prisma.user.findUnique({ where: { id: uid }, select: { telegramChatId: true } }) : null;
  if (me?.telegramChatId) {
    const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
    const set = new Set((s?.telegramAlertChatIds || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean));
    set.add(me.telegramChatId);
    await prisma.siteSettings.upsert({ where: { id: '1' }, update: { telegramAlertChatIds: [...set].join(',') }, create: { id: '1', telegramAlertChatIds: me.telegramChatId } });
  }
  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=notifications&attach=${me?.telegramChatId ? 'ok' : 'none'}`);
}

async function registerTelegramWebhook() {
  'use server';
  await requireAdmin();
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const base = ((s as { publicSiteUrl?: string } | null)?.publicSiteUrl || process.env.NEXTAUTH_URL || 'https://young.idivles.ru').replace(/\/$/, '');
  const r = await tgSetWebhook(`${base}/api/integrations/telegram/webhook`);
  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=notifications&tghook=${r.ok ? 'ok' : 'fail'}`);
}

async function registerMaxWebhook(formData: FormData) {
  'use server';
  await requireAdmin();
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const base = ((s as { publicSiteUrl?: string } | null)?.publicSiteUrl || process.env.NEXTAUTH_URL || 'https://young.idivles.ru').replace(/\/$/, '');
  const secret = String(formData.get('maxWebhookSecret') || '').trim() || (s as { maxWebhookSecret?: string } | null)?.maxWebhookSecret || '';
  const r = await maxSetWebhook(`${base}/api/integrations/max/webhook`, secret);
  const { redirect } = await import('next/navigation');
  redirect(`/admin/settings?tab=notifications&maxhook=${r.ok ? 'ok' : 'fail'}`);
}

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string }> }) {
  await requireAdminPage();
  const resolvedParams = await searchParams;
  const rawTab = resolvedParams.tab || 'general';
  const activeTab = rawTab === 'afisha' ? 'general' : rawTab;
  const justSaved  = resolvedParams.saved === '1';

  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });

  // No extra stats needed here, keeping only settings

  const tabs = [
    { id: 'general',    label: 'Основное',       icon: Settings2, group: 'Сайт' },
    { id: 'appearance', label: 'Контакты и часы', icon: Building2, group: 'Сайт' },
    { id: 'social',     label: 'Соцсети',         icon: Share2, group: 'Сайт' },
    { id: 'booking',    label: 'Бронирование',    icon: Calendar, group: 'Сайт' },
    { id: 'access',     label: 'Доступ',          icon: Shield, group: 'Правила' },
    { id: 'legal',      label: '152-ФЗ / cookie', icon: Scale, group: 'Правила' },
    { id: 'gov',        label: 'Госуслуги',       icon: Landmark, group: 'Правила' },
    { id: 'moderation', label: 'Модерация',       icon: ShieldAlert, group: 'Правила' },
    { id: 'maintenance', label: 'Работы', icon: Construction, group: 'Правила' },
    { id: 'eco',        label: 'Эко-баллы',       icon: Leaf, group: 'Система' },
    { id: 'replica',    label: 'Репликация',      icon: Server, group: 'Система' },
    { id: 'analytics',  label: 'Аналитика',       icon: Zap, group: 'Система' },
    { id: 'demo',       label: 'Демо',      icon: Database, group: 'Система' },
    { id: 'smtp',       label: 'Почта',    icon: Mail, group: 'Интеграции' },
    { id: 'vk-api',     label: 'VK API',          icon: Globe, group: 'Интеграции' },
    { id: 'notifications', label: 'Оповещения',   icon: Bell, group: 'Интеграции' },
  ];

  const govWidgets = parseGovWidgetsJson((settings as any)?.govWidgetsJson);
  const modCfg = parseModerationConfig((settings as any)?.moderationConfigJson);
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.65rem 1rem', borderRadius: '8px',
    border: '1.5px solid #e2e8f0', background: '#f8fafc',
    fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '0.4rem',
    fontWeight: 600, fontSize: '0.82rem', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  const cardStyle: React.CSSProperties = {
    background: 'white', borderRadius: '16px',
    padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.04)', marginBottom: '1rem',
  };

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .settings-tab { display:flex; align-items:center; gap:0.4rem; padding:0.4rem 0.65rem; border-radius:100px; font-weight:600; font-size:0.85rem; transition:all 0.2s; color:var(--muted); text-decoration:none; white-space:nowrap; }
        .settings-tab:hover:not(.active) { background:rgba(59,130,246,0.06); color:var(--foreground); }
        .settings-tab.active { background:var(--primary); color:white; }
        .settings-input { width:100%; padding:0.65rem 1rem; border-radius:8px; border:1.5px solid #e2e8f0; background:#f8fafc; font-size:0.95rem; outline:none; transition:border-color 0.2s; box-sizing:border-box; }
        .settings-input:focus { border-color:var(--primary); background:white; box-shadow:0 0 0 3px rgba(59,130,246,0.08); }
        .toggle-switch { position:relative; display:inline-block; width:46px; height:26px; flex-shrink:0; }
        .toggle-switch input { opacity:0; width:0; height:0; }
        .toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#cbd5e1; transition:.3s; border-radius:26px; }
        .toggle-slider:before { position:absolute; content:""; height:20px; width:20px; left:3px; bottom:3px; background-color:white; transition:.3s; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.12); }
        input:checked + .toggle-slider { background-color:var(--primary); }
        input:checked + .toggle-slider:before { transform:translateX(20px); }
        .setting-row { display:flex; justify-content:space-between; align-items:flex-start; gap:2rem; padding:1.25rem 0; border-bottom:1px solid #f8fafc; }
        .setting-row:last-child { border-bottom:none; padding-bottom:0; }
        .setting-row:first-child { padding-top:0; }
        @keyframes slideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .tab-content { animation: slideIn 0.25s ease; }
        .stat-mini { background:linear-gradient(135deg,#f0f9ff,#e0f2fe); padding:0.75rem 1.25rem; border-radius:12px; display:flex; align-items:center; gap:0.75rem; }
        .settings-save-float {
          position: fixed; left: 50%; bottom: max(1rem, env(safe-area-inset-bottom));
          transform: translateX(-50%); z-index: 80; display: flex; justify-content: center;
          pointer-events: none; width: min(100% - 1.5rem, 420px);
        }
        .settings-save-float__btn, .settings-save-float__toast {
          pointer-events: auto; display: inline-flex; align-items: center; gap: 0.45rem;
          border: none; border-radius: 999px; padding: 0.7rem 1.25rem; font-weight: 700;
          font-size: 0.92rem; box-shadow: 0 8px 28px rgba(15,23,42,0.18); cursor: pointer;
        }
        .settings-save-float__btn {
          background: var(--primary); color: #fff;
        }
        .settings-save-float__btn:hover { filter: brightness(1.05); }
        .settings-save-float__toast.is-ok {
          background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; cursor: default;
        }
      `}} />

      <form id="yp-settings-form" action={updateSettings} encType="multipart/form-data">
        <input type="hidden" name="settingsTab" value={activeTab} />
        {/* Page Header */}
        <div className="settings-page-header" style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Настройки сайта
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Управляйте параметрами портала. Кнопка «Сохранить» появится после изменений.
          </p>
        </div>

      {/* Tab Bar */}
      <div className="settings-tabs">
        {(() => {
          const groups: { name: string; items: typeof tabs }[] = [];
          for (const tab of tabs) {
            const g = (tab as { group?: string }).group || 'Прочее';
            const last = groups[groups.length - 1];
            if (!last || last.name !== g) groups.push({ name: g, items: [tab] });
            else last.items.push(tab);
          }
          return groups.map((g) => (
            <div key={g.name} className="settings-tab-group" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="settings-tab-group-label" style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>{g.name}</span>
              {g.items.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Link key={tab.id} href={`?tab=${tab.id}`} className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}>
                    <Icon size={14} /> {tab.label}
                  </Link>
                );
              })}
            </div>
          ));
        })()}
      </div>



        {/* =================== GENERAL =================== */}
        {activeTab === 'general' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Название сайта</label>
                  <input name="siteName" type="text" defaultValue={settings?.siteName || 'Центр развития молодежи Сочи'} className="settings-input" placeholder="Центр развития молодежи Сочи" />
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Шапка, подвал, вкладки браузера, письма, PWA-манифест, юр. тексты (плейсхолдеры).
                  </p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Публичный адрес сайта (домен)</label>
                  <input
                    name="publicSiteUrl"
                    type="url"
                    defaultValue={(settings as any)?.publicSiteUrl || ''}
                    className="settings-input"
                    placeholder="https://young.idivles.ru"
                  />
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Используется в письмах, .ics, приглашениях, проверке политики, sitemap.
                    Пусто — берётся <code>NEXTAUTH_URL</code> из окружения сервера.
                    При смене домена на VPS обновите также <code>NEXTAUTH_URL</code> в docker-compose / .env (cookies авторизации).
                  </p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <LogoImageField currentLogo={settings?.logoUrl || DEFAULT_LOGO} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Фон главной — картинка (poster)</label>
                  <input type="hidden" name="heroImageUrl" defaultValue={(settings as any)?.heroImageUrl || '/brand/hero-cover.jpg'} />
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 480,
                      height: 140,
                      borderRadius: 14,
                      marginBottom: '0.75rem',
                      backgroundImage: `linear-gradient(rgba(15,23,42,0.35), rgba(15,23,42,0.55)), url(${(settings as any)?.heroImageUrl || '/brand/hero-cover.jpg'})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid rgba(15,23,42,0.08)',
                    }}
                  />
                  <input
                    type="file"
                    name="heroFile"
                    accept="image/*"
                    className="settings-input"
                    style={{ padding: '0.55rem' }}
                  />
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Обложка ВК / постер под видео. По умолчанию — `/brand/hero-cover.jpg`.
                  </p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Фон главной — видео (mp4)</label>
                  <input
                    type="file"
                    name="heroVideoFile"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    className="settings-input"
                    style={{ padding: '0.55rem' }}
                  />
                  <p style={{ margin: '0.4rem 0 0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Зацикленное беззвучное видео. Можно загрузить живую обложку из VK (макс. 40 МБ) или указать путь ниже.
                  </p>
                  <input
                    name="heroVideoUrl"
                    className="settings-input"
                    defaultValue={(settings as any)?.heroVideoUrl || '/brand/hero-cover.mp4'}
                    placeholder="/brand/hero-cover.mp4"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Анимация фона на главной</label>
                  <select
                    name="heroAnimationMode"
                    defaultValue={(settings as any)?.heroAnimationMode || 'animated'}
                    className="settings-input"
                  >
                    <option value="animated">Анимированный (для картинки без видео)</option>
                    <option value="static">Статичный (без движения)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Настройки регистрации */}
            <div style={cardStyle}>
              <div>
                <div className="setting-row">
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>Открытая Афиша мероприятий</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      Позволяет незарегистрированным гостям смотреть раздел <code>/events</code>. При выключении — перенаправляет на страницу входа.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="publicEventsVisibility" value="true" defaultChecked={settings?.publicEventsVisibility ?? false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div>
                <div className="setting-row">
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>Галерея на главной</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      Блок «Деятельность портала» на главной странице.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="galleryHomepageEnabled" value="true" defaultChecked={(settings as any)?.galleryHomepageEnabled ?? true} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="setting-row" style={{ marginTop: '0.85rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>Страница /gallery</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      Отдельный раздел галереи деятельности администрации портала (меню и подвал).
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="galleryPageEnabled" value="true" defaultChecked={(settings as any)?.galleryPageEnabled ?? true} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="setting-row" style={{ marginTop: '0.85rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>Галерея для гостей</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      Если выключено — гости не видят галерею на главной и на /gallery (только авторизованные).
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="galleryPublicEnabled" value="true" defaultChecked={(settings as any)?.galleryPublicEnabled ?? false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div style={{ marginTop: '0.85rem' }}>
                  <label style={labelStyle}>Фото деятельности портала (URL или JSON с подписями)</label>
                  <textarea
                    name="orgGalleryJson"
                    rows={4}
                    defaultValue={(settings as any)?.orgGalleryJson || ''}
                    className="settings-input"
                    placeholder='[{"url":"/uploads/gallery/1.webp","caption":"Открытие сезона"}]'
                  />
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    Эти же ссылки можно выбирать в админке пространств/клубов как из общей базы.
                  </p>
                </div>
                <div style={{ marginTop: '0.75rem', maxWidth: 220 }}>
                  <label style={labelStyle}>Лимит личной галереи (база)</label>
                  <input
                    name="galleryMaxPerUser"
                    type="number"
                    min={1}
                    max={48}
                    defaultValue={(settings as any)?.galleryMaxPerUser ?? 12}
                    className="settings-input"
                  />
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.75rem' }}>
                    Соцрейтинг добавляет бонусные слоты сверху.
                  </p>
                </div>
                <div style={{ marginTop: '0.75rem', maxWidth: 280 }}>
                  <label style={labelStyle}>Макс. размер фото галереи (байты)</label>
                  <input
                    name="galleryMaxUploadBytes"
                    type="number"
                    min={262144}
                    max={15728640}
                    step={262144}
                    defaultValue={(settings as any)?.galleryMaxUploadBytes ?? 2097152}
                    className="settings-input"
                  />
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
                    По умолчанию 2&nbsp;МБ. Файлы дополнительно сжимаются на сервере (WebP).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================== APPEARANCE / CONTACTS =================== */}
        {activeTab === 'appearance' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>📧 Email для связи</label>
                  <input name="contactEmail" type="email" defaultValue={settings?.contactEmail || ''} className="settings-input" placeholder="info@young.idivles.ru" />
                </div>
                <div>
                  <label style={labelStyle}>Email поддержки</label>
                  <input name="supportEmail" type="email" defaultValue={(settings as any)?.supportEmail || ''} className="settings-input" placeholder="support@molodost.sochi.ru" />
                </div>
                <div>
                  <label style={labelStyle}>📱 Контактный телефон</label>
                  <input name="contactPhone" type="text" defaultValue={settings?.contactPhone || ''} className="settings-input" placeholder="+7 (862) 000-00-00" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>📍 Фактический адрес</label>
                  <input name="address" type="text" defaultValue={settings?.address || ''} className="settings-input" placeholder="г. Сочи, ул. Центральная, д. 1" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Режим работы (МСК) — влияет на бронирование</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <div>
                      <label style={{ ...labelStyle, textTransform: 'none', fontSize: '0.75rem' }}>Дни</label>
                      <input
                        name="contactsWorkDays"
                        type="text"
                        className="settings-input"
                        defaultValue={(() => {
                          const wh = String((settings as any)?.workHours || 'пн–пт');
                          return wh.split(',')[0]?.trim() || 'пн–пт';
                        })()}
                        placeholder="пн–пт"
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, textTransform: 'none', fontSize: '0.75rem' }}>Открытие</label>
                      <input
                        name="contactsOpenTime"
                        type="time"
                        className="settings-input"
                        defaultValue={(settings as any)?.bookingOpenTime || '09:00'}
                        step={300}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, textTransform: 'none', fontSize: '0.75rem' }}>Закрытие</label>
                      <input
                        name="contactsCloseTime"
                        type="time"
                        className="settings-input"
                        defaultValue={(settings as any)?.bookingCloseTime || '21:00'}
                        step={300}
                      />
                    </div>
                  </div>
                  <p style={{ margin: '0.55rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Сейчас: {(settings as any)?.workHours || 'не задано'}. Эти часы синхронизируются с окном бронирования.
                  </p>
                  <input type="hidden" name="workHours" value={(settings as any)?.workHours || ''} />
                </div>
              </div>
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', fontSize: '0.85rem', color: '#92400e' }}>
                <strong>💡 Подсказка:</strong> После сохранения — данные появятся на странице <a href="/contacts" target="_blank" style={{ color: '#d97706' }}>/contacts</a> автоматически.
              </div>
            </div>
          </div>
        )}

        {/* =================== SOCIAL =================== */}
        {activeTab === 'social' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { id: 'vk',       label: 'ВКонтакте',       color: '#0077FF', placeholder: 'https://vk.ru/crm.sochi' },
                  { id: 'tg',       label: 'Telegram',         color: '#0088cc', placeholder: 'https://t.me/crm_sochi' },
                  { id: 'max',      label: 'MAX',              color: '#471AFF', placeholder: 'https://max.ru/…' },
                  { id: 'ok',       label: 'Одноклассники',    color: '#ed812b', placeholder: 'https://ok.ru/…' },
                  { id: 'whatsapp', label: 'WhatsApp',         color: '#25D366', placeholder: 'https://wa.me/78622533237' },
                  { id: 'rutube',   label: 'Rutube',           color: '#181C21', placeholder: 'https://rutube.ru/channel/...' },
                ].map(social => (
                  <div key={social.id} className="settings-social-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: '120px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: social.color, flexShrink: 0 }}></div>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--foreground)' }}>{social.label}</span>
                    </div>
                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                      <input type="checkbox" name={`${social.id}Enabled`} value="true" defaultChecked={(settings as any)?.[social.id + 'Enabled'] ?? false} />
                      <span className="toggle-slider"></span>
                    </label>
                    <input
                      name={`${social.id}Link`} type="url"
                      defaultValue={(settings as any)?.[social.id + 'Link'] || ''}
                      placeholder={social.placeholder}
                      className="settings-input"
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', fontSize: '0.85rem', color: '#0369a1' }}>
                <strong>ℹ️ Совет:</strong> Ссылки должны начинаться с <code>https://</code>. Включённые, но без ссылки соцсети — не отображаются.
              </div>
            </div>
          </div>
        )}

        {/* =================== ACCESS =================== */}
        {activeTab === 'access' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div>
                <div className="setting-row">
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 700 }}>📅 Открытая Афиша</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.6 }}>
                      Гости без аккаунта смогут просматривать раздел <code style={{ background: '#f1f5f9', padding: '0 4px', borderRadius: '4px' }}>/events</code>. При отключении — редиректят на логин.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="publicEventsVisibility" value="true" defaultChecked={settings?.publicEventsVisibility ?? false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-row">
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Регистрация новых пользователей</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.6 }}>
                      Выключение закрывает регистрацию. Политика и правила автоматически укажут текущий режим.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="registrationEnabled" value="true" defaultChecked={(settings as any)?.registrationEnabled !== false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-row">
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Личные сообщения (режим тишины)</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.6 }}>
                      Выключение запрещает переписку между обычными пользователями. Админы и модераторы не затрагиваются. Политика/правила обновятся сами.
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" name="messagingEnabled" value="true" defaultChecked={(settings as any)?.messagingEnabled !== false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, background: 'linear-gradient(135deg,#fef9c3,#fffbeb)', border: '1px solid #fde68a' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700, color: '#92400e' }}>Защита администратора</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350f', lineHeight: 1.6 }}>
                    Доступ к <code>/admin/users</code> и <code>/admin/settings</code> — только <strong>ADMIN</strong>.
                    Модераторы получают отдельные разделы по галочкам прав.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================== MAINTENANCE =================== */}
        {activeTab === 'maintenance' && (
          <div className="tab-content">
            <div style={{ ...cardStyle, border: settings?.maintenanceMode ? '1.5px solid #f59e0b' : undefined, background: settings?.maintenanceMode ? 'linear-gradient(180deg,#fffbeb,#ffffff)' : 'white' }}>
              <div className="setting-row">
                <div>
                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Construction size={20} color="#d97706" /> На сайте проводятся работы
                  </h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 640 }}>
                    Включает публичную заглушку для всех посетителей. Администраторы, модераторы и сканер продолжают работать.
                    Вход для сотрудников остаётся доступен.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    name="maintenanceMode"
                    value="true"
                    defaultChecked={settings?.maintenanceMode ?? false}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'grid', gap: '1rem', marginTop: '1.25rem' }}>
                <div>
                  <label style={labelStyle}>Сообщение для посетителей</label>
                  <textarea
                    name="maintenanceMessage"
                    rows={4}
                    className="settings-input"
                    defaultValue={settings?.maintenanceMessage || ''}
                    placeholder="Сейчас на портале проводятся технические работы. Мы скоро вернёмся."
                    style={{ resize: 'vertical', minHeight: 96 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Ориентир по времени (необязательно)</label>
                  <input
                    name="maintenanceEta"
                    type="text"
                    className="settings-input"
                    defaultValue={settings?.maintenanceEta || ''}
                    placeholder="например: до 15:00 МСК или ~30 минут"
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.55 }}>
                <strong>Как пользоваться:</strong> включите перед деплоем или при аварии → сохраните → проверьте
                {' '}<a href="/maintenance" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 600 }}>/maintenance</a>
                {' '}в режиме инкогнито → после работ выключите тумблер.
              </div>
            </div>
          </div>
        )}

        {/* =================== SMTP =================== */}
        {activeTab === 'smtp' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>SMTP Сервер (Host)</label>
                  <input name="smtpHost" type="text" defaultValue={settings?.smtpHost || ''} className="settings-input" placeholder="resend or smtp.yandex.ru" />
                </div>
                <div>
                  <label style={labelStyle}>Порт</label>
                  <input name="smtpPort" type="number" defaultValue={settings?.smtpPort || 465} className="settings-input" />
                </div>
                <div>
                  <label style={labelStyle}>Логин / Email</label>
                  <input name="smtpUser" type="text" defaultValue={settings?.smtpUser || ''} className="settings-input" placeholder="noreply@domain.ru" />
                </div>
                <div>
                  <label style={labelStyle}>Пароль приложения</label>
                  <input name="smtpPass" type="password" defaultValue="" className="settings-input" placeholder="Оставьте пустым — не изменится" />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>Оставьте поле пустым, если не хотите менять пароль</p>
                </div>
                <div>
                  <label style={labelStyle}>Адрес отправителя (From)</label>
                  <input name="smtpFrom" type="email" defaultValue={settings?.smtpFrom || ''} className="settings-input" placeholder="noreply@domain.ru" />
                </div>
              </div>

                            <div style={{ padding: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.6 }}>
                <strong>Рекомендации для РФ (152-ФЗ ст.12 — трансграничная передача):</strong><br/>
                Предпочтительно: Host = <code>unisender</code> (РФ) или SMTP Яндекс/Mail.ru на серверах в РФ —
                Host <code>smtp.yandex.ru</code>, Port <code>465</code>.<br/>
                Host = <code>resend</code> (США) — только если оформлено основание трансграничной передачи ПДн
                и домен отправителя верифицирован. From = verified email / <code>onboarding@resend.dev</code> для теста.<br/>
                Пароль поля = API-ключ провайдера или пароль SMTP.
              </div>
            </div>
          </div>
        )}

        {/* =================== VK API =================== */}
        {activeTab === 'vk-api' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, fontSize: '0.88rem', color: '#0c4a6e', lineHeight: 1.55 }}>
                Новости портала можно автоматически подтягивать со стены группы VK (текст, фото, видео).
                По умолчанию для Сочи: <a href="https://vk.ru/crm.sochi" target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#0369a1' }}>vk.ru/crm.sochi</a>.
                Сейчас на проде синхронизация не идёт, пока выключен автоимпорт или пуст сервисный ключ —
                включите оба поля, сохраните и нажмите «Синхронизировать сейчас». Расписание часов настраивается ниже.
              </div>

              <div className="setting-row">
                <div>
                  <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Автоимпорт новостей из VK</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.6 }}>
                    Загружать новые посты и публиковать их в разделе «Новости». Можно выключить в любой момент.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="vkSyncEnabled" value="true" defaultChecked={settings?.vkSyncEnabled ?? false} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
                <div>
                  <label style={labelStyle}>Сервисный ключ (Service Token)</label>
                  <input name="vkApiToken" type="password" defaultValue={settings?.vkApiToken || ''} className="settings-input" placeholder="vk1.a.xxxxxxxx..." />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>VK → приложение → сервисный ключ доступа</p>
                </div>
                <div>
                  <label style={labelStyle}>Группа или канал</label>
                  <input
                    name="vkGroupId"
                    type="text"
                    defaultValue={settings?.vkGroupId || 'crm.sochi'}
                    className="settings-input"
                    placeholder="crm.sochi или https://vk.ru/crm.sochi"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                    Короткий адрес, ссылка vk.ru/vk.com или числовой ID (−123…). Пример: <code>crm.sochi</code>
                  </p>
                </div>
              </div>

              {settings?.vkLastSync && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} />
                  Последняя синхронизация: <strong>{new Date(settings.vkLastSync).toLocaleString('ru-RU')}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================== BOOKING =================== */}
        {activeTab === 'booking' && (
          <div className="tab-content">
            <div style={{...cardStyle, padding: '1.25rem 1.5rem'}}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>Минимальный срок подачи (в часах)</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>За сколько часов запрещено бронировать</div>
                  </div>
                  <input name="minBookingHours" type="number" defaultValue={settings?.minBookingHours || 3} className="settings-input" style={{ width: '80px', padding: '0.5rem', textAlign: 'center' }} />
                </div>
                
                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>Авто-одобрение заявок</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Новые заявки получают статус APPROVED автоматически</div>
                  </div>
                  <label className="toggle-switch" style={{ transform: 'scale(0.9)', transformOrigin: 'right center' }}>
                    <input type="checkbox" name="autoApproveBookings" value="true" defaultChecked={settings?.autoApproveBookings ?? false} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>Рабочее окно бронирования</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>В какое время суток можно начинать и заканчивать бронь</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '0.25rem' }}>С</label>
                      <input
                        name="bookingOpenTime"
                        type="time"
                        defaultValue={(settings as any)?.bookingOpenTime || '09:00'}
                        className="settings-input"
                        style={{ width: '120px', padding: '0.5rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '0.25rem' }}>До</label>
                      <input
                        name="bookingCloseTime"
                        type="time"
                        defaultValue={(settings as any)?.bookingCloseTime || '21:00'}
                        className="settings-input"
                        style={{ width: '120px', padding: '0.5rem' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>Напоминание за N часов</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Письмо организатору и участникам (cron: /api/cron/reminders)</div>
                  </div>
                  <input name="reminderHoursBefore" type="number" min={1} max={168} defaultValue={(settings as any)?.reminderHoursBefore || 24} className="settings-input" style={{ width: '80px', padding: '0.5rem', textAlign: 'center' }} />
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', fontSize: '0.85rem', color: '#78350f' }}>
                <strong>⚠️ Важно:</strong> Одобрить или отклонить уже поданные заявки на бронирование можно в разделе <a href="/admin/bookings" style={{ color: '#b45309', fontWeight: 600 }}>Заявки на бронь</a>.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'moderation' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>Модерация переписок</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Лимиты сообщений, автоблокировка по предупреждениям и уведомления о решениях.
                Разбор флагов — в разделе{' '}
                <Link href="/admin/moderation" style={{ color: 'var(--primary)', fontWeight: 600 }}>Модерация</Link>.
              </p>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Фильтрация сообщений</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Скрывать опасный контент и создавать флаги для модераторов
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="modEnabled" value="true" defaultChecked={modCfg.enabled} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Уведомлять о решении (ACTIONED)</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Пользователь получает текст с категорией, фрагментом сообщения и ответом модератора
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="modNotifyActioned" value="true" defaultChecked={modCfg.notifyOnActioned} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Уведомлять о снятии флага</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Если модератор снял ложное срабатывание
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="modNotifyDismissed" value="true" defaultChecked={modCfg.notifyOnDismissed} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                <div>
                  <label style={labelStyle}>Макс. длина сообщения</label>
                  <input name="modMaxLength" type="number" min={200} max={8000} defaultValue={modCfg.maxMessageLength} className="settings-input" />
                </div>
                <div>
                  <label style={labelStyle}>Лимит в минуту</label>
                  <input name="modPerMinute" type="number" min={3} max={120} defaultValue={modCfg.rateLimits.perMinute} className="settings-input" />
                </div>
                <div>
                  <label style={labelStyle}>Лимит в час</label>
                  <input name="modPerHour" type="number" min={10} max={2000} defaultValue={modCfg.rateLimits.perHour} className="settings-input" />
                </div>
                <div>
                  <label style={labelStyle}>Пауза между сообщениями (мс)</label>
                  <input name="modMinInterval" type="number" min={0} max={10000} defaultValue={modCfg.minMessageIntervalMs} className="settings-input" />
                </div>
                <div>
                  <label style={labelStyle}>Автоблок после N предупреждений</label>
                  <input name="modAutoBlock" type="number" min={0} max={50} defaultValue={modCfg.autoBlockWarnThreshold} className="settings-input" />
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 4 }}>0 — отключено</div>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, marginTop: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>Портфолио</h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Ограничение повторной отправки портфолио на проверку. Администратор видит список изменений при каждой отправке.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Пауза между отправками (дней)</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    По умолчанию 7. Значение 0 — без ограничения
                  </div>
                </div>
                <input
                  name="portfolioSubmitCooldownDays"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={(settings as any)?.portfolioSubmitCooldownDays ?? 7}
                  className="settings-input"
                  style={{ width: 88, padding: '0.5rem', textAlign: 'center' }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700 }}>Telegram-оповещения</h3>
              <label style={labelStyle}>Токен бота</label>
              <input name="telegramBotToken" type="password" autoComplete="off" defaultValue="" placeholder="Оставьте пустым — не менять" className="settings-input" />
              <label style={labelStyle}>Chat ID получателей (по одному в строке или через запятую)</label>
              <textarea name="telegramAlertChatIds" rows={4} defaultValue={(settings as any)?.telegramAlertChatIds || ''} placeholder="123456789" className="settings-input" />
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input type="checkbox" name="telegramAlertsEnabled" value="true" defaultChecked={(settings as any)?.telegramAlertsEnabled || false} /> Включить Telegram-оповещения
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <button type="submit" formAction={testTelegram} className="btn">Отправить тест</button>
                <button type="submit" formAction={attachMyTelegram} className="btn">Добавить мой Telegram из профиля</button>
                <button type="submit" formAction={registerTelegramWebhook} className="btn">Подключить модерацию (вебхук)</button>
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Важно: каждый получатель должен один раз нажать Start у бота. После «Подключить модерацию» новые заявки и брони приходят с кнопками Одобрить/Отклонить; команда /pending — очередь.
                Вебхук: <code>/api/integrations/telegram/webhook</code>.
              </p>
            </div>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700 }}>Ежедневный бэкап в Telegram</h3>
              <p style={{ margin: '0 0 0.75rem', color: 'var(--muted)', fontSize: '0.88rem' }}>
                Зашифрованный (AES-256) дамп БД + архив отправляется <b>только</b> выбранному chat ID. Пароль — фраза «Шумко Евгений, дай пароль!».
                Фраза «Абракадабра, Евгений Шумко!» по-прежнему доступна авторизованным chat ID из списка оповещений.
              </p>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" name="dailyBackupEnabled" value="true" defaultChecked={(settings as any)?.dailyBackupEnabled || false} /> Включить ежедневный бэкап
              </label>
              <label style={labelStyle}>Chat ID получателя (только один админ)</label>
              <input
                name="dailyBackupChatId"
                type="text"
                inputMode="numeric"
                defaultValue={(settings as any)?.dailyBackupChatId || ''}
                placeholder="Например 8555955292"
                className="settings-input"
                style={{ maxWidth: 320 }}
              />
              <label style={labelStyle}>Час отправки (МСК, 0–23)</label>
              <input
                name="dailyBackupHour"
                type="number"
                min={0}
                max={23}
                defaultValue={(settings as any)?.dailyBackupHour ?? 3}
                className="settings-input"
                style={{ width: 88, textAlign: 'center' }}
              />
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                По умолчанию 03:00 МСК. Получатель должен хотя бы раз нажать Start у бота Young.Portal.
              </p>
            </div>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700 }}>MAX-бот</h3>
              <label style={labelStyle}>Токен бота MAX</label>
              <input name="maxBotToken" type="password" autoComplete="off" defaultValue="" placeholder="Оставьте пустым — не менять" className="settings-input" />
              <label style={labelStyle}>Секрет вебхука</label>
              <input name="maxWebhookSecret" type="password" autoComplete="off" defaultValue="" placeholder="Оставьте пустым — не менять" className="settings-input" />
              <label style={labelStyle}>MAX chat/user id получателей</label>
              <textarea name="maxAlertChatIds" rows={3} defaultValue={(settings as any)?.maxAlertChatIds || ''} className="settings-input" />
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input type="checkbox" name="maxBotEnabled" value="true" defaultChecked={(settings as any)?.maxBotEnabled || false} /> Включить MAX-бота
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <button type="submit" formAction={testMaxAlert} className="btn">Тест MAX</button>
                <button type="submit" formAction={registerMaxWebhook} className="btn">Зарегистрировать вебхук</button>
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>MAX требует верифицированное юрлицо РФ + токен бота; на сервере — корневой сертификат Минцифры. Вебхук: <code>/api/integrations/max/webhook</code>.</p>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700 }}>Яндекс.Метрика</h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Укажите номер счётчика. Цели: <code>register</code>, <code>application</code>, <code>booking</code>, <code>event_join</code>, <code>event_waitlist</code>, <code>ticket_checkin</code>.
                По умолчанию счётчик грузится только после согласия на аналитические cookie (вкладка «152-ФЗ / cookie»).
              </p>
              <label style={labelStyle}>ID счётчика</label>
              <input
                name="yandexMetrikaId"
                type="text"
                inputMode="numeric"
                defaultValue={(settings as any)?.yandexMetrikaId || ''}
                placeholder="12345678"
                className="settings-input"
                style={{ maxWidth: 280 }}
              />
            </div>
          </div>
        )}

        {activeTab === 'legal' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>Соответствие 152-ФЗ (редакция 06.08.2026)</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Cookie-баннер с opt-in для аналитики, защита контента от копирования, реквизиты оператора ПДн.
                Тексты политики и правил редактируются в{' '}
                <Link href="/admin/pages" style={{ color: 'var(--primary)', fontWeight: 600 }}>Страницах</Link>
                {' '}(/privacy, /rules). Зашифрованный снимок портала — в{' '}
                <Link href="/admin/backup" style={{ color: 'var(--primary)', fontWeight: 600 }}>Бэкап</Link>.
              </p>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Cookie-баннер</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Всплывающее окно: «Принять все» / «Только необходимые»
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="cookieBannerEnabled" value="true" defaultChecked={(settings as any)?.cookieBannerEnabled !== false} />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Метрика только после согласия</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Не загружать Яндекс.Метрику до согласия на аналитические cookie
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="analyticsConsentRequired" value="true" defaultChecked={(settings as any)?.analyticsConsentRequired !== false} />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Защита от копирования</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Блокировка копирования / ПКМ на публичных страницах (поля ввода и юр. тексты доступны)
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="copyProtectionEnabled" value="true" defaultChecked={(settings as any)?.copyProtectionEnabled !== false} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>Оператор персональных данных</h3>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div>
                  <label style={labelStyle}>Наименование</label>
                  <input name="operatorName" className="settings-input" defaultValue={(settings as any)?.operatorName || ''} placeholder="МБУ «Дом молодёжи» …" />
                </div>
                <div>
                  <label style={labelStyle}>ИНН</label>
                  <input name="operatorInn" className="settings-input" defaultValue={(settings as any)?.operatorInn || ''} placeholder="2300000000" />
                </div>
                <div>
                  <label style={labelStyle}>ОГРН</label>
                  <input name="operatorOgrn" className="settings-input" defaultValue={(settings as any)?.operatorOgrn || ''} placeholder="1022300000000" />
                </div>
                <div>
                  <label style={labelStyle}>Email ответственного за ПДн</label>
                  <input name="pdnResponsibleEmail" type="email" className="settings-input" defaultValue={(settings as any)?.pdnResponsibleEmail || ''} placeholder="pdn@example.ru" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gov' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>Госуслуги на главной</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Компактная полоска внизу главной (перед CTA). Ссылки и подписи можно менять в любой момент.
                Разрешены Госуслуги / ПОС и ссылки на VK-мини-приложения (только как кнопки, не iframe).
              </p>

              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Показывать блок на главной</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Общий выключатель секции</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="govWidgetsEnabled" value="true" defaultChecked={Boolean((settings as any)?.govWidgetsEnabled)} />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <label style={labelStyle}>Заголовок секции</label>
                <input
                  name="govWidgetsTitle"
                  className="settings-input"
                  defaultValue={(settings as any)?.govWidgetsTitle || 'Государственные сервисы'}
                />
              </div>
            </div>

            {govWidgets.map((w) => (
              <div key={w.id} style={cardStyle}>
                <div className="setting-row" style={{ alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>Слот: {w.id}</div>
                  <label className="toggle-switch">
                    <input type="checkbox" name={`gov_${w.id}_enabled`} value="true" defaultChecked={w.enabled} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  <div>
                    <label style={labelStyle}>Название</label>
                    <input name={`gov_${w.id}_title`} className="settings-input" defaultValue={w.title} />
                  </div>
                  <div>
                    <label style={labelStyle}>Тип</label>
                    <select name={`gov_${w.id}_kind`} className="settings-input" defaultValue={w.kind}>
                      <option value="link">Ссылка / кнопка</option>
                      <option value="iframe">Iframe (табло)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>HTTPS URL</label>
                    <input
                      name={`gov_${w.id}_url`}
                      className="settings-input"
                      defaultValue={w.url}
                      placeholder="https://www.gosuslugi.ru/ или URL iframe табло"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Подпись / заметка</label>
                    <input name={`gov_${w.id}_note`} className="settings-input" defaultValue={w.note || ''} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}


        {/* =================== DEMO =================== */}
        {activeTab === 'eco' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Leaf size={18} /> Эко-баллы и пул
              </h2>
              <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>
                Общий лимит портала (по умолчанию 1&nbsp;000&nbsp;000). Выдача участникам и награды в конкурсах
                списывают остаток пула. Счётчик в магазине — компактный, без навязчивости.
              </p>
              <AdminEcoPoolPanel />
            </div>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Дополнительно</h3>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#475569', fontSize: '0.88rem', lineHeight: 1.55 }}>
                <li>Покупка в магазине сразу надевает предмет (голос/тема применяются без второго шага).</li>
                <li>Админ может выдать баллы на карточке пользователя и здесь по коду профиля.</li>
                <li>В конкурсах — ручная награда эко-баллами + авто при одобрении/победе.</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'replica' && (
          <div className="tab-content">
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={18} /> Репликация / резервный узел
              </h2>
              <AdminReplicaClient />
            </div>
          </div>
        )}

        {activeTab === 'demo' && (
          <div className="tab-content">
            <DemoSettingsPanel />
          </div>
        )}

      {/* VK sync + schedule — inside form so schedule JSON is saved */}
      {activeTab === 'vk-api' && (
        <SettingsVkSync
          lastSync={settings?.vkLastSync?.toISOString() || null}
          syncEnabled={Boolean(settings?.vkSyncEnabled)}
          hasToken={Boolean((settings?.vkApiToken || '').trim())}
          groupId={settings?.vkGroupId || null}
          scheduleJson={(settings as { vkSyncScheduleJson?: string | null } | null)?.vkSyncScheduleJson || null}
        />
      )}

      </form>

      {!['eco', 'replica', 'demo'].includes(activeTab) ? (
        <SettingsSaveBar justSaved={justSaved} formId="yp-settings-form" />
      ) : null}

      {/* SMTP Test Tool (outside form, uses its own server action) */}
      {activeTab === 'smtp' && (
        <div style={{ ...cardStyle, marginTop: '1.5rem', border: '1.5px dashed #e2e8f0' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={18} style={{ color: '#f59e0b' }} /> Тестирование подключения
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Сначала сохраните SMTP-настройки, затем отправьте тестовое письмо для проверки.
          </p>
          <form action={testEmail} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input name="testTo" type="email" required placeholder="Введите ваш email для проверки" className="settings-input" style={{ flex: 1, minWidth: '200px' }} />
            <button type="submit" className="btn btn-secondary" style={{ whiteSpace: 'nowrap', borderRadius: '100px', padding: '0.65rem 1.5rem' }}>
              <Mail size={16} style={{ marginRight: '0.4rem' }} /> Отправить тест
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
