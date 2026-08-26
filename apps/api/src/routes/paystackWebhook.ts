/**
 * @module routes/paystackWebhook
 * Paystack webhook receiver with HMAC SHA-512 signature verification.
 * Processes: charge.success, subscription.create, subscription.disable,
 *            invoice.payment_failed, transfer.success
 */
import { Router } from "express";
import express from "express";
import { Subscription } from "../models/Subscription";
import { getPaymentProvider } from "../billing/paystackProvider";
import { ProcessedWebhookEvent } from "../models/ProcessedWebhookEvent";
import { createInvoice, markInvoicePaid } from "../billing/invoiceService";
import { getPlanByCode, monthsForInterval, type PlanCode, type Interval } from "../billing/plans";
import { logSecurityEvent } from "../services/securityLogger";
import { dispatchWebhooks } from "../services/webhookDispatcher";
import { ENV } from "../config/env";

export const paystackWebhookRouter = Router();

// Paystack sends JSON; we need the raw body for signature verification
paystackWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const provider = getPaymentProvider();
    if (!provider) {
      return res.status(503).json({ error: "Payment provider not configured" });
    }

    const sig = req.headers["x-paystack-signature"] as string;
    if (!sig) {
      return res.status(400).json({ error: "Missing x-paystack-signature header" });
    }

    let event;
    try {
      event = provider.verifyWebhook(req.body, sig);
    } catch (err: any) {
      logSecurityEvent({
        event: "admin.access_denied",
        ip: req.ip,
        metadata: { reason: "paystack_webhook_signature_failed", error: err.message },
      });
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    // Idempotency: claim the event before doing any work. Paystack retries
    // until it sees a 2xx, and every handler here has side effects (extends the
    // billing period, raises an invoice), so a replay must be a no-op.
    // Prefer the provider's own id; fall back to the signature, which is a
    // digest of the exact payload and so is stable across retries.
    const eventKey = event.data?.id ? String(event.data.id) : sig;
    try {
      await ProcessedWebhookEvent.create({
        provider: "paystack",
        eventKey,
        eventType: event.event,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        // Already handled by an earlier delivery — acknowledge and stop.
        return res.sendStatus(200);
      }
      throw err;
    }

    try {
      switch (event.event) {
        case "charge.success":
          await handleChargeSuccess(event.data);
          break;

        case "subscription.create":
          await handleSubscriptionCreate(event.data);
          break;

        case "subscription.not_renew":
        case "subscription.disable":
          await handleSubscriptionDisable(event.data);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event.data);
          break;

        default:
          break;
      }

      // Paystack expects 200 response to acknowledge receipt
      res.sendStatus(200);
    } catch (err: any) {
      // Release the claim so Paystack's retry can reprocess — otherwise a
      // transient failure here would permanently swallow the event.
      await ProcessedWebhookEvent.deleteOne({ provider: "paystack", eventKey }).catch(() => {});
      console.error("[paystack-webhook] Error processing event:", event.event, err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  },
);

// ─── Event Handlers ──────────────────────────────────────────────────

async function handleChargeSuccess(data: Record<string, any>) {
  const meta = data.metadata || {};
  const tenantId = meta.tenantId;
  if (!tenantId) return;

  const planCode = meta.planCode as PlanCode;
  const interval = (meta.interval || "MONTH") as Interval;
  const plan = getPlanByCode(planCode);
  if (!plan) return;

  const months = monthsForInterval(interval);
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const paystackCustomerCode = data.customer?.customer_code || null;
  const reference = data.reference;

  const sub = await Subscription.findOneAndUpdate(
    { tenantId },
    {
      planCode,
      interval,
      seats: plan.seats,
      status: "ACTIVE",
      provider: "paystack",
      paystackCustomerCode,
      paystackSubscriptionCode: reference,
      entitlements: plan.entitlements,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      lastPaymentAt: now,
      failedPaymentCount: 0,
      nextRetryAt: null,
      graceUntil: null,
    },
    { new: true, upsert: true },
  );

  // Generate invoice
  const invoice = await createInvoice({
    tenantId,
    subscriptionId: String(sub._id),
    planCode,
    interval,
    // Ties the invoice to the Paystack transaction so a redelivered
    // charge.success returns the existing invoice instead of billing again.
    providerReference: reference,
  });
  await markInvoicePaid(String(invoice._id));

  await dispatchWebhooks(tenantId, "payment.succeeded", {
    subscriptionId: String(sub._id),
    planCode,
    interval,
    provider: "paystack",
    reference,
    amountKobo: data.amount,
  });
}

async function handleSubscriptionCreate(data: Record<string, any>) {
  const customerCode = data.customer?.customer_code;
  if (!customerCode) return;

  const sub = await Subscription.findOne({ paystackCustomerCode: customerCode });
  if (!sub) return;

  const subscriptionCode = data.subscription_code;
  if (subscriptionCode) {
    sub.paystackSubscriptionCode = subscriptionCode;
  }
  sub.status = "ACTIVE";
  sub.autoRenew = true;
  await sub.save();
}

async function handleSubscriptionDisable(data: Record<string, any>) {
  const subscriptionCode = data.subscription_code;
  if (!subscriptionCode) return;

  const sub = await Subscription.findOne({ paystackSubscriptionCode: subscriptionCode });
  if (!sub) return;

  sub.status = "CANCELED";
  sub.canceledAt = new Date();
  sub.autoRenew = false;
  await sub.save();
}

async function handlePaymentFailed(data: Record<string, any>) {
  const meta = data.metadata || {};
  const tenantId = meta.tenantId;

  // Metadata only. A customer code is not a tenant identifier: codes are
  // reused across a Paystack account and can be supplied by the payload, so
  // falling back to one lets an event be applied to the wrong tenant's
  // subscription. Without an explicit tenantId there is nothing safe to do.
  if (!tenantId) return;

  const sub = await Subscription.findOne({ tenantId });
  if (!sub) return;

  sub.failedPaymentCount += 1;
  sub.status = "GRACE";
  sub.graceUntil = new Date(Date.now() + ENV.GRACE_DAYS * 86400000);

  const retryDelays = [3600, 14400, 86400, 259200];
  const delayIdx = Math.min(sub.failedPaymentCount - 1, retryDelays.length - 1);
  sub.nextRetryAt = new Date(Date.now() + retryDelays[delayIdx] * 1000);

  await sub.save();

  await dispatchWebhooks(String(sub.tenantId), "payment.failed", {
    subscriptionId: String(sub._id),
    planCode: sub.planCode,
    failedPaymentCount: sub.failedPaymentCount,
    graceUntil: sub.graceUntil?.toISOString(),
  });
}
