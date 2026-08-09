import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

type SendResult = { success: boolean; messageId?: string; error?: string; provider?: string; skipped?: boolean };

type SendOptions = {
  attachments?: EmailAttachment[];
};

const SMTP_BLOCKED_MSG =
  "Исходящий SMTP заблокирован провайдером AEZA (порты 25/465/587). " +
  "Задайте RESEND_API_KEY в .env или smtpHost=resend в админке.";

function isSmtpBlockedByProvider(): boolean {
  return process.env.EMAIL_SMTP_BLOCKED === "1";
}

function resendKeyFromEnv(): string {
  return (process.env.RESEND_API_KEY || "").trim();
}

function resendFromEnv(): string {
  return (process.env.RESEND_FROM || "").trim();
}

/** Reject empty / placeholder keys (e.g. 16-char junk in smtpPass). */
function looksLikeApiKey(key: string): boolean {
  const k = (key || "").trim();
  if (!k) return false;
  if (k.length < 20) return false;
  return true;
}

/**
 * True only when outbound mail can actually be sent.
 * If Resend/UniSender/SMTP is not configured — callers should skip email
 * (register without OTP, forgot-password via phrase/admin).
 */
export async function isOutboundEmailReady(): Promise<boolean> {
  const envKey = resendKeyFromEnv();
  if (looksLikeApiKey(envKey)) return true;

  const settings = await prisma.siteSettings.findUnique({ where: { id: "1" } });
  if (!settings) return false;

  const host = (settings.smtpHost || "").trim().toLowerCase();
  const envProvider = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const dbKey = (settings.smtpPass || "").trim();

  const wantsResend =
    envProvider === "resend" ||
    host === "resend" ||
    host === "api.resend.com";
  const wantsUnisender =
    envProvider === "unisender" ||
    host === "unisender" ||
    host === "api.unisender.com";

  if (wantsResend || wantsUnisender) {
    return looksLikeApiKey(dbKey);
  }

  if (isSmtpBlockedByProvider()) return false;

  return Boolean(settings.smtpHost && settings.smtpUser && looksLikeApiKey(settings.smtpPass || ""));
}


/**
 * Провайдеры (smtpHost в SiteSettings):
 *   "resend"    → HTTPS API Resend
 *   "unisender" → HTTPS API UniSender
 *   иначе       → SMTP (не работает на AEZA без разблокировки портов)
 *
 * RESEND_API_KEY / RESEND_FROM в .env имеют приоритет над smtpPass/smtpFrom.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendOptions = {}
): Promise<SendResult> {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "1" } });

  if (!settings) {
    console.warn("[EMAIL] SiteSettings не найдены");
    return { success: false, error: "Настройки сайта не найдены", skipped: true };
  }

  if (!(await isOutboundEmailReady())) {
    console.warn("[EMAIL] skipped — outbound mail not configured");
    return {
      success: false,
      error: "email_not_configured",
      provider: "none",
      skipped: true,
    };
  }

  const host = (settings.smtpHost || "").trim().toLowerCase();
  const envResendKey = resendKeyFromEnv();
  const envProvider = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const dbApiKey = (settings.smtpPass || "").trim();
  const apiKey = envResendKey || dbApiKey;
  const from =
    resendFromEnv() || (settings.smtpFrom || settings.smtpUser || "").trim();
  const fromName = (settings.siteName || "Центр развития молодежи Сочи").trim();
  const attachments = options.attachments || [];

  const resendOpts = { apiKey, from, fromName, to, subject, html, attachments };

  if (envResendKey || envProvider === "resend" || host === "resend" || host === "api.resend.com") {
    const result = await sendViaResend(resendOpts);
    if (result.success || !envResendKey) return result;
  }

  if (host === "unisender" || host === "api.unisender.com" || envProvider === "unisender") {
    return sendViaUnisender({ apiKey, from, fromName, to, subject, html });
  }

  if (isSmtpBlockedByProvider()) {
    if (envResendKey) {
      return sendViaResend(resendOpts);
    }
    console.warn("[EMAIL] SMTP skipped — AEZA blocks outbound mail ports");
    return { success: false, error: SMTP_BLOCKED_MSG, provider: "smtp" };
  }

  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    console.warn("[EMAIL] SMTP/API не настроен");
    return { success: false, error: "Почта не настроена (Resend/UniSender или SMTP)" };
  }

  const smtpResult = await sendViaSmtp({
    host: settings.smtpHost,
    port: settings.smtpPort || 465,
    user: settings.smtpUser,
    pass: settings.smtpPass,
    from: from || settings.smtpUser,
    to,
    subject,
    html,
    attachments,
  });

  if (!smtpResult.success && envResendKey) {
    const fallback = await sendViaResend(resendOpts);
    if (fallback.success) return fallback;
  }

  return smtpResult;
}

async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}): Promise<SendResult> {
  if (!opts.apiKey) {
    return {
      success: false,
      error: "email_not_configured",
      skipped: true,
      provider: "resend",
    };
  }

  const fromEmail = opts.from || "onboarding@resend.dev";
  const fromHeader = opts.fromName ? `${opts.fromName} <${fromEmail}>` : fromEmail;

  try {
    const payload: Record<string, unknown> = {
      from: fromHeader,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments.length) {
      payload.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content)
          ? a.content.toString("base64")
          : Buffer.from(a.content, "utf8").toString("base64"),
      }));
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.message || data?.error || `Resend HTTP ${res.status}`;
      console.error("[EMAIL][resend] fail:", msg, data);
      return { success: false, error: String(msg), provider: "resend" };
    }

    console.log(`[EMAIL][resend] OK → ${opts.to}`, data?.id);
    return { success: true, messageId: data?.id, provider: "resend" };
  } catch (e: any) {
    console.error("[EMAIL][resend] exception:", e?.message || e);
    return { success: false, error: e?.message || String(e), provider: "resend" };
  }
}

async function sendViaUnisender(opts: {
  apiKey: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  if (!opts.apiKey) {
    return { success: false, error: "UniSender: не задан API-ключ", provider: "unisender" };
  }
  if (!opts.from) {
    return { success: false, error: "UniSender: не задан smtpFrom", provider: "unisender" };
  }

  try {
    const body = new URLSearchParams({
      format: "json",
      api_key: opts.apiKey,
      email: opts.to,
      sender_name: opts.fromName || "Portal",
      sender_email: opts.from,
      subject: opts.subject,
      body: opts.html,
      list_id: "1",
      error_checking: "1",
    });

    const res = await fetch("https://api.unisender.com/ru/api/sendEmail", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      const msg = data?.error || data?.message || `UniSender HTTP ${res.status}`;
      console.error("[EMAIL][unisender] fail:", msg, data);
      return { success: false, error: String(msg), provider: "unisender" };
    }

    const id = data?.result?.email_id;
    console.log(`[EMAIL][unisender] OK → ${opts.to}`, id);
    return { success: true, messageId: id, provider: "unisender" };
  } catch (e: any) {
    console.error("[EMAIL][unisender] exception:", e?.message || e);
    return { success: false, error: e?.message || String(e), provider: "unisender" };
  }
}

async function sendViaSmtp(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}): Promise<SendResult> {
  try {
    const rejectUnauthorized = process.env.SMTP_TLS_INSECURE === "1" ? false : true;
    const transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      auth: { user: opts.user, pass: opts.pass },
      tls: { rejectUnauthorized },
    });

    const info = await transporter.sendMail({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[EMAIL][smtp] OK → ${opts.to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId, provider: "smtp" };
  } catch (error: any) {
    console.error("[EMAIL][smtp] fail:", error?.message || error);
    return { success: false, error: error?.message || String(error), provider: "smtp" };
  }
}
