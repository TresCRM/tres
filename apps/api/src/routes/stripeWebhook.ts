/**
 * @module routes/stripeWebhook
 * Stripe webhook receiver with signature verification.
 * Processes: checkout.session.completed, invoice.paid, invoice.payment_failed,
 *            customer.subscription.updated, customer.subscription.deleted
 */
import { Router } from "express";
import express from "express";
import { Subscription } from "../models/Subscription";
import { Tenant } from "../models/Tenant";
import { getPaymentProvider } from "../billing/stripeProvider";
import { createInvoice, markInvoicePaid } from "../billing/invoiceService";
import { getPlanByCode, type PlanCode, type Interval } from "../billing/plans";
import { logSecurityEvent } from "../services/securityLogger";
import { dispatchWebhooks } from "../services/webhookDispatcher";
import { ENV } from "../config/env";

export const stripeWebhookRouter = Router();

// Stripe requires the raw body for signature verification
stripeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const provider = getPaymentProvider();
    if (!provider) {
      return res.status(503).json({ error: "Payment provider not configured" });
    }

    const sig = req.headers["stripe-signature"] as string;
    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event;
    try {
      event = provider.constructWebhookEvent(req.body, sig);
    } catch (err: any) {
      logSecurityEvent({
        event: "admin.access_denied",
        ip: req.ip,
        metadata: { reason: "stripe_webhook_signature_failed", error: err.message },
      });
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutComplete(event.data.object);
          break;

        case "invoice.paid":
          await handleInvoicePaid(event.data.object);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event.data.object);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object);
          break;

        default:
          // Unhandled event type — acknowledge receipt
          break;
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[stripe-webhook] Error processing event:", event.type, err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  },
);

// ─── Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutComplete(data: Record<string, any>) {
  const meta = data.metadata || {};
  const tenantId = meta.tenantId;
  if (!tenantId) return;

  const planCode = meta.planCode as PlanCode;
  const interval = meta.interval as Interval;
  const plan = getPlanByCode(planCode);
  if (!plan) return;

  const stripeCustomerId = data.customer as string;
  const stripeSubscriptionId = data.subscription as string;

  const sub = await Subscription.findOneAndUpdate(
    { tenantId },
    {
      planCode,
      interval,
      seats: plan.seats,
      status: "ACTIVE",
      provider: "stripe",
      stripeCustomerId,
      stripeSubscriptionId,
      entitlements: plan.entitlements,
      lastPaymentAt: new Date(),
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
  });
  await markInvoicePaid(String(invoice._id));

  // Dispatch tenant webhook
  await dispatchWebhooks(tenantId, "payment.succeeded", {
    subscriptionId: String(sub._id),
    planCode,
    interval,
    provider: "stripe",
  });
}

async function handleInvoicePaid(data: Record<string, any>) {
  const stripeSubscriptionId = data.subscription as string;
  if (!stripeSubscriptionId) return;

  const sub = await Subscription.findOne({ stripeSubscriptionId });
  if (!sub) return;

  sub.status = "ACTIVE";
  sub.lastPaymentAt = new Date();
  sub.failedPaymentCount = 0;
  sub.nextRetryAt = null;
  sub.graceUntil = null;

  // Update period from Stripe data
  const lines = data.lines?.data?.[0];
  if (lines?.period) {
    sub.currentPeriodStart = new Date(lines.period.start * 1000);
    sub.currentPeriodEnd = new Date(lines.period.end * 1000);
  }

  await sub.save();

  await dispatchWebhooks(String(sub.tenantId), "payment.succeeded", {
    subscriptionId: String(sub._id),
    planCode: sub.planCode,
    amountCents: data.amount_paid,
  });
}

async function handlePaymentFailed(data: Record<string, any>) {
  const stripeSubscriptionId = data.subscription as string;
  if (!stripeSubscriptionId) return;

  const sub = await Subscription.findOne({ stripeSubscriptionId });
  if (!sub) return;

  sub.failedPaymentCount += 1;
  sub.status = "GRACE";
  sub.graceUntil = new Date(Date.now() + ENV.GRACE_DAYS * 86400000);

  // Exponential backoff for retries: 1h, 4h, 24h, 72h
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

async function handleSubscriptionUpdated(data: Record<string, any>) {
  const provider = getPaymentProvider();
  if (!provider) return;

  const stripeSubId = data.id as string;
  const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSubId });
  if (!sub) return;

  const sync = provider.syncSubscriptionStatus(data as any);
  sub.status = sync.status;
  sub.currentPeriodStart = sync.currentPeriodStart;
  sub.currentPeriodEnd = sync.currentPeriodEnd;
  sub.autoRenew = sync.autoRenew;
  if (sync.canceledAt) sub.canceledAt = sync.canceledAt;

  await sub.save();
}

async function handleSubscriptionDeleted(data: Record<string, any>) {
  const stripeSubId = data.id as string;
  const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSubId });
  if (!sub) return;

  sub.status = "CANCELED";
  sub.canceledAt = new Date();
  sub.autoRenew = false;
  await sub.save();
}
