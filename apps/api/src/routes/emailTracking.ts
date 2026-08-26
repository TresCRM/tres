/**
 * Email Delivery Tracking & Bounce Handling
 *
 * POST /api/v1/email-tracking/webhook — receives delivery status webhooks from
 * email providers (SendGrid, Mailgun, AWS SES, etc.)
 *
 * Handles: delivered, bounced, complained, dropped
 * On hard bounce: marks customer email as invalid
 */
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Types } from "mongoose";
import { Customer } from "../models/Customer";
import { EmailMessage } from "../models/EmailMessage";
import pino from "pino";

const log = pino({ name: "email-tracking" });

export const emailTrackingRouter = Router();

const EventSchema = z.object({
  event: z.enum(["delivered", "bounced", "complained", "dropped", "deferred"]),
  email: z.string().email(),
  reason: z.string().optional(),
  bounceType: z.enum(["hard", "soft"]).optional(),
  timestamp: z.string().optional(),
  messageId: z.string().optional(),
  /** Some providers echo back custom args; accept an explicit tenant when given. */
  tenantId: z.string().optional(),
});

/**
 * Work out which tenant an inbound delivery event belongs to.
 *
 * The provider payload is not tenant-aware, so resolve it from the outbound
 * message we recorded when sending. Returns null when the tenant cannot be
 * established — callers must not fall back to an unscoped write, since the same
 * address can exist as a customer under many tenants.
 */
async function resolveTenantId(
  tenantId: string | undefined,
  messageId: string | undefined
): Promise<Types.ObjectId | null> {
  if (tenantId && Types.ObjectId.isValid(tenantId)) return new Types.ObjectId(tenantId);
  if (!messageId) return null;

  const sent = await EmailMessage.findOne({ providerId: messageId })
    .select("tenantId")
    .lean();

  return (sent?.tenantId as Types.ObjectId | undefined) ?? null;
}

/**
 * Verify HMAC-SHA256 webhook signature.
 * If EMAIL_WEBHOOK_SECRET is configured, the request must include a valid
 * X-Webhook-Signature header. If the secret is not configured, we log a
 * warning and allow the request through (backward compatible).
 */
function verifyWebhookSignature(req: any): { valid: boolean; reason?: string } {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    log.warn("EMAIL_WEBHOOK_SECRET not configured — webhook signature verification skipped");
    return { valid: true };
  }

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  if (!signature) {
    return { valid: false, reason: "missing X-Webhook-Signature header" };
  }

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

  // timingSafeEqual throws when the buffers differ in length, so a malformed
  // header would surface as a 500 instead of a rejection. Length is not secret
  // (the digest size is fixed), so checking it first leaks nothing.
  const provided = Buffer.from(signature);
  const digest = Buffer.from(expected);
  if (provided.length !== digest.length) {
    return { valid: false, reason: "signature mismatch" };
  }
  if (!crypto.timingSafeEqual(provided, digest)) {
    return { valid: false, reason: "signature mismatch" };
  }

  return { valid: true };
}

// POST /api/v1/email-tracking/webhook
emailTrackingRouter.post("/webhook", async (req, res) => {
  try {
    // HMAC signature verification
    const sig = verifyWebhookSignature(req);
    if (!sig.valid) {
      log.warn({ reason: sig.reason }, "Webhook signature verification failed");
      res.status(401).json({ error: "invalid_signature" });
      return;
    }
    // Support both single event and array of events (provider-dependent)
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const raw of events) {
      const parsed = EventSchema.safeParse(raw);
      if (!parsed.success) continue;

      const { event, email, reason, bounceType, messageId } = parsed.data;

      log.info({ event, email, reason, bounceType }, "Email tracking event received");

      // On hard bounce: mark customer email as potentially invalid
      if (event === "bounced" && bounceType === "hard") {
        const tenantId = await resolveTenantId(parsed.data.tenantId, messageId);
        if (!tenantId) {
          // Without a tenant this would flag the address for every tenant that
          // happens to have that customer. Skip rather than write across tenants.
          log.warn(
            { email, messageId },
            "Hard bounce with no resolvable tenant — skipping customer update"
          );
          continue;
        }

        await Customer.updateMany(
          { tenantId, email: email.toLowerCase() },
          { $set: { emailBounced: true, emailBouncedAt: new Date(), bounceReason: reason } }
        );
        log.warn(
          { email, reason, tenantId: String(tenantId) },
          "Hard bounce — marked customer email as bounced"
        );
      }

      // On complaint (spam report): log for compliance
      if (event === "complained") {
        log.warn({ email }, "Spam complaint received — consider suppressing future emails");
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    log.error({ error: e.message }, "Email tracking webhook error");
    res.status(400).json({ error: "invalid_event" });
  }
});
