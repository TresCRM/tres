import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { ENV } from "../config/env";

const DISABLED = process.env.EMAILS_DISABLED === "1" || process.env.NODE_ENV === "test";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  messageKey?: string;
  headers?: Record<string, string>;
}

/**
 * Resolve which SMTP transport to use based on SMTP_PROVIDER env var.
 *
 *  - "default"  → SMTP_HOST / SMTP_PORT (default: localhost:1025 for MailHog)
 *  - "trescrm"  → SMTP_TRESCRM_* vars (mail.tres-crm.com:465 with auth)
 *  - (tests)    → jsonTransport (no network)
 */
function createTransport(): Transporter {
  if (DISABLED) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const provider = process.env.SMTP_PROVIDER || "default";

  if (provider === "trescrm") {
    const host = process.env.SMTP_TRESCRM_HOST || "mail.tres-crm.com";
    const port = Number(process.env.SMTP_TRESCRM_PORT || 465);
    const secure = process.env.SMTP_TRESCRM_SECURE === "1" || port === 465;
    const user = process.env.SMTP_TRESCRM_USER;
    const pass = process.env.SMTP_TRESCRM_PASS;

    if (!user || !pass) {
      console.warn("[mail] SMTP_PROVIDER=trescrm but SMTP_TRESCRM_USER/PASS not set. Falling back to default.");
      return createDefaultTransport();
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }, // self-signed certs on shared hosting
    });
  }

  return createDefaultTransport();
}

function createDefaultTransport(): Transporter {
  return nodemailer.createTransport({
    host: ENV.SMTP.HOST,
    port: ENV.SMTP.PORT,
    secure: ENV.SMTP.SECURE,
    auth: ENV.SMTP.USER ? { user: ENV.SMTP.USER, pass: ENV.SMTP.PASS } : undefined,
    ignoreTLS: true,
    tls: { rejectUnauthorized: false },
  });
}

// Module-level singleton — created once on first use
let _mailer: Transporter | undefined;

export function getMailer(): Transporter {
  if (!_mailer) _mailer = createTransport();
  return _mailer;
}

/** @deprecated Use getMailer() — kept for backward compat */
export const mailer = DISABLED
  ? nodemailer.createTransport({ jsonTransport: true })
  : createDefaultTransport();

// ─── Send Functions ──────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  tenantSlug: string,
  token: string,
  code: string,
  from?: string
) {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
  const verifyUrl = `${frontendOrigin}/verify?tenant=${encodeURIComponent(
    tenantSlug
  )}&email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;

  // Pretty HTML with BOTH options: the code (recommended) and the magic link
  const html = [
    `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">`,
    `  <h1 style="font-size: 22px; margin: 0 0 8px;">Verify your email</h1>`,
    `  <p style="color: #6b7280; margin: 0 0 24px;">Welcome to TRES CRM. Choose one of the options below to finish setting up your account.</p>`,
    ``,
    `  <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">`,
    `    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 8px;">Your verification code</div>`,
    `    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827; font-family: ui-monospace, monospace;">${code}</div>`,
    `    <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Enter this code on the verification page</div>`,
    `  </div>`,
    ``,
    `  <p style="text-align: center; color: #9ca3af; margin: 20px 0; font-size: 13px;">— or —</p>`,
    ``,
    `  <div style="text-align: center; margin-bottom: 20px;">`,
    `    <a href="${verifyUrl}" style="display: inline-block; background: #4F46E5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Click here to verify</a>`,
    `  </div>`,
    ``,
    `  <p style="font-size: 13px; color: #6b7280; margin: 20px 0 0;">This code and link expire in 24 hours.</p>`,
    `  <p style="font-size: 12px; color: #9ca3af; margin: 12px 0 0;">If you didn't create a TRES CRM account, you can safely ignore this email.</p>`,
    `</div>`,
  ].join("\n");

  const text = [
    `Verify your TRES CRM email`,
    ``,
    `Your verification code: ${code}`,
    ``,
    `Or click this link: ${verifyUrl}`,
    ``,
    `This code and link expire in 24 hours.`,
  ].join("\n");

  try {
    await getMailer().sendMail({
      from: from ?? resolveFrom(),
      to,
      subject: `Your TRES CRM verification code: ${code}`,
      html,
      text,
    });
  } catch (e: any) {
    console.error("[mail] verification send failed", {
      provider: process.env.SMTP_PROVIDER || "default",
      to,
      code: e?.code,
      command: e?.command,
      response: e?.response,
      responseCode: e?.responseCode,
      message: e?.message,
    });
    if (process.env.EMAIL_STRICT === "1") throw e;
  }
}

export async function sendEmail(input: SendEmailInput) {
  if (DISABLED) {
    return { skipped: true, id: `skip_${Date.now()}` };
  }

  // Sanitize headers to prevent SMTP injection (CR/LF injection)
  const safeHeaders: Record<string, string> = {};
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      safeHeaders[k.replace(/[\r\n]/g, "")] = String(v).replace(/[\r\n]/g, "");
    }
  }

  // Add List-Unsubscribe header for non-transactional emails (CAN-SPAM compliance)
  const isTransactional =
    input.messageKey?.startsWith("verify") ||
    input.messageKey?.startsWith("password_reset");
  if (!isTransactional && !safeHeaders["List-Unsubscribe"]) {
    safeHeaders["List-Unsubscribe"] =
      "<mailto:unsubscribe@tres-crm.com?subject=unsubscribe>";
  }

  const from = resolveFrom();
  const info = await getMailer().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: Object.keys(safeHeaders).length ? safeHeaders : undefined,
  });
  return { id: info.messageId, accepted: info.accepted };
}

/**
 * Send a test email to verify SMTP configuration.
 * Used by the CLI test script and optionally from admin panel.
 */
export async function sendTestEmail(to: string): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> {
  const provider = process.env.SMTP_PROVIDER || "default";
  const from = resolveFrom();

  try {
    const transport = createTransport();
    const info = await transport.sendMail({
      from,
      to,
      subject: "TRES CRM — Email Delivery Test",
      html: [
        "<div style='font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;'>",
        "<h2 style='color: #4F46E5;'>Email Delivery Test</h2>",
        `<p>This is a test email from <strong>TRES CRM</strong> sent via the <code>${provider}</code> provider.</p>`,
        `<p><strong>From:</strong> ${from}</p>`,
        `<p><strong>To:</strong> ${to}</p>`,
        `<p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`,
        `<p><strong>Server:</strong> ${provider === "trescrm" ? process.env.SMTP_TRESCRM_HOST : (process.env.SMTP_HOST || "localhost")}</p>`,
        "<hr style='border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;'>",
        "<p style='color: #6b7280; font-size: 12px;'>If you received this email, your SMTP configuration is working correctly.</p>",
        "</div>",
      ].join("\n"),
      text: `TRES CRM Email Delivery Test\n\nProvider: ${provider}\nTimestamp: ${new Date().toISOString()}\n\nIf you received this, SMTP is configured correctly.`,
    });

    return { success: true, provider, messageId: info.messageId };
  } catch (e: any) {
    return { success: false, provider, error: e.message || String(e) };
  }
}

function resolveFrom(): string {
  const provider = process.env.SMTP_PROVIDER || "default";
  if (provider === "trescrm") {
    return process.env.SMTP_TRESCRM_FROM || "TRES CRM <info@tres-crm.com>";
  }
  return process.env.FROM_EMAIL || "no-reply@trescrm.local";
}
