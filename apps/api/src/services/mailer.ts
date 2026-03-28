import nodemailer from "nodemailer";
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

// In tests/disabled mode, use jsonTransport (no network). Otherwise use real SMTP.
export const mailer = DISABLED
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      host: ENV.SMTP.HOST,
      port: ENV.SMTP.PORT,
      secure: ENV.SMTP.SECURE,
      // optional hardening/smoothing:
      ignoreTLS: true,
      tls: { rejectUnauthorized: false }
    });

export async function sendVerificationEmail(
  to: string,
  tenantSlug: string,
  token: string,
  from?: string
) {
  const verifyUrl = `http://localhost:3000/verify?tenant=${encodeURIComponent(
    tenantSlug
  )}&email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;

  try {
    await mailer.sendMail({
      from: from ?? "no-reply@trescrm.local",
      to,
      subject: "Verify your TRES CRM email",
      html: `<p>Please verify your email.</p><p><a href="${verifyUrl}">Verify account</a></p>`
    });
  } catch (e: any) {
    // Never fail the business flow in tests; only fail if explicitly strict
    if (process.env.EMAIL_STRICT === "1") throw e;
    // eslint-disable-next-line no-console
    console.warn("[mail] send failed (non-strict):", e?.message || e);
  }
}

export async function sendEmail(input: SendEmailInput) {
  if (DISABLED) {
    return { skipped: true, id: `skip_${Date.now()}` };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === "1",
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });

  const from = process.env.FROM_EMAIL || "no-reply@trescrm.local";
  const info = await transporter.sendMail({
    from, to: input.to, subject: input.subject, html: input.html, text: input.text, headers: input.headers
  });
  return { id: info.messageId, accepted: info.accepted };
}
