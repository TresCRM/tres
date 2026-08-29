/**
 * @module workers/billing.worker
 * Billing worker: processes subscription renewals, payment retries with
 * exponential backoff, dunning email sequences, grace period transitions,
 * automatic downgrade on expired subscriptions, and invoice generation.
 *
 * Can run as:
 *  - One-shot: `ts-node apps/api/src/workers/billing.worker.ts`
 *  - Cron-scheduled (see startCron export)
 */
import "dotenv/config";
import { withLock } from "../utils/distributedLock";
import { connectMongo, disconnectMongo } from "../db/mongoose";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import {
  getPlanByCode,
  monthsForInterval,
  priceForInterval,
  type Interval,
  type PlanCode,
} from "../billing/plans";
import { createInvoice, markInvoicePaid } from "../billing/invoiceService";
import { sendEmail } from "../services/mailer";
import pino from "pino";

const log = pino({ name: "billing-worker" });
const GRACE_DAYS = Number(process.env.GRACE_DAYS || 7);

// ─── Helpers ─────────────────────────────────────────────────────────

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

/** Exponential backoff delays in seconds: 1h, 4h, 24h, 72h */
/** Longer than a sweep can plausibly take, shorter than the cron interval. */
const BILLING_LOCK_TTL_MS = 30 * 60 * 1000;

const RETRY_DELAYS = [3600, 14400, 86400, 259200];

function getNextRetryDelay(failCount: number): number {
  const idx = Math.min(failCount, RETRY_DELAYS.length - 1);
  return RETRY_DELAYS[idx] * 1000;
}

async function getOwnerEmail(tenantId: any): Promise<string> {
  const owner = await User.findOne({
    tenantId,
    roles: { $in: ["OWNER", "BILLING"] },
    status: "ACTIVE",
  }).select("email").lean();
  return owner?.email || process.env.BILLING_FROM_EMAIL || "billing@trescrm.local";
}

async function sendDunning(to: string, subject: string, html: string, text: string, key: string) {
  if (process.env.EMAILS_DISABLED === "1" || process.env.EMAILS_DISABLED === "true") return;
  try {
    await sendEmail({ to, subject, html, text, messageKey: key });
  } catch (err: any) {
    log.error({ to, key, err: err.message }, "Failed to send dunning email");
  }
}

// ─── Core Processing ─────────────────────────────────────────────────

async function runOnce(now = new Date()) {
  await processExpiredGrace(now);
  await processRenewals(now);
  await processPaymentRetries(now);
  await sendDunningReminders(now);
  await autoDowngradeExpired(now);
}

/**
 * Phase 1: Expire subscriptions whose grace period has elapsed.
 */
async function processExpiredGrace(now: Date) {
  const expired = await Subscription.find({
    status: "GRACE",
    graceUntil: { $lte: now },
  });

  for (const sub of expired) {
    sub.status = "EXPIRED";
    sub.nextRetryAt = null;
    await sub.save();

    const email = await getOwnerEmail(sub.tenantId);
    await sendDunning(
      email,
      "Subscription expired",
      `<p>Your subscription has expired after the grace period ended. Please update your payment method to restore access.</p>`,
      "Your subscription has expired. Please update your payment method.",
      `billing_expired_${String(sub._id)}`,
    );

    log.info({ tenantId: String(sub.tenantId), planCode: sub.planCode }, "Subscription expired");
  }
}

/**
 * Phase 2: Renew ACTIVE subscriptions whose period has ended.
 * For manual provider only — Paystack manages its own renewals via webhooks.
 */
async function processRenewals(now: Date) {
  const due = await Subscription.find({
    status: "ACTIVE",
    currentPeriodEnd: { $lte: now },
    autoRenew: true,
    provider: "manual",
  });

  for (const sub of due) {
    const plan = getPlanByCode(sub.planCode as PlanCode);
    if (!plan) continue;

    const shouldFail = process.env.BILLING_FORCE_FAIL === "1";
    const months = monthsForInterval(sub.interval as Interval);

    if (!shouldFail) {
      // Successful renewal
      const start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      sub.currentPeriodStart = start;
      sub.currentPeriodEnd = addMonths(start, months);
      sub.status = "ACTIVE";
      sub.graceUntil = null;
      sub.failedPaymentCount = 0;
      sub.nextRetryAt = null;
      sub.lastPaymentAt = now;
      await sub.save();

      // Generate and pay invoice
      try {
        const invoice = await createInvoice({
          tenantId: String(sub.tenantId),
          subscriptionId: String(sub._id),
          planCode: sub.planCode,
          interval: sub.interval as Interval,
        });
        await markInvoicePaid(String(invoice._id));
      } catch (err: any) {
        log.error({ err: err.message }, "Invoice generation failed");
      }

      const email = await getOwnerEmail(sub.tenantId);
      await sendDunning(
        email,
        "Payment received",
        `<p>Thanks! Your ${plan.name} plan is active until ${sub.currentPeriodEnd.toISOString().slice(0, 10)}.</p>`,
        `Active until ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`,
        `billing_paid_${String(sub._id)}_${Date.now()}`,
      );

      log.info({ tenantId: String(sub.tenantId) }, "Subscription renewed");
    } else {
      // Payment failed — enter grace
      sub.status = "GRACE";
      sub.graceUntil = new Date(now.getTime() + GRACE_DAYS * 86400000);
      sub.failedPaymentCount = (sub.failedPaymentCount || 0) + 1;
      sub.nextRetryAt = new Date(now.getTime() + getNextRetryDelay(sub.failedPaymentCount));
      await sub.save();

      const email = await getOwnerEmail(sub.tenantId);
      await sendDunning(
        email,
        "Payment failed — action required",
        `<p>We couldn't process your renewal for ${plan.name}. You have ${GRACE_DAYS} days of grace before your subscription expires.</p>`,
        `Payment failed. ${GRACE_DAYS} days grace remaining.`,
        `billing_failed_${String(sub._id)}_${Date.now()}`,
      );

      log.warn({ tenantId: String(sub.tenantId), failCount: sub.failedPaymentCount }, "Payment failed");
    }
  }
}

/**
 * Phase 3: Retry failed payments with exponential backoff.
 * Only for manual provider — Paystack handles its own retries.
 */
async function processPaymentRetries(now: Date) {
  const retryable = await Subscription.find({
    status: "GRACE",
    provider: "manual",
    nextRetryAt: { $lte: now },
    failedPaymentCount: { $lt: 4 },
  });

  for (const sub of retryable) {
    const shouldFail = process.env.BILLING_FORCE_FAIL === "1";
    const plan = getPlanByCode(sub.planCode as PlanCode);
    if (!plan) continue;

    if (!shouldFail) {
      const months = monthsForInterval(sub.interval as Interval);
      const start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      sub.currentPeriodStart = start;
      sub.currentPeriodEnd = addMonths(start, months);
      sub.status = "ACTIVE";
      sub.graceUntil = null;
      sub.failedPaymentCount = 0;
      sub.nextRetryAt = null;
      sub.lastPaymentAt = now;
      await sub.save();

      try {
        const invoice = await createInvoice({
          tenantId: String(sub.tenantId),
          subscriptionId: String(sub._id),
          planCode: sub.planCode,
          interval: sub.interval as Interval,
        });
        await markInvoicePaid(String(invoice._id));
      } catch {}

      log.info({ tenantId: String(sub.tenantId) }, "Payment retry succeeded");
    } else {
      sub.failedPaymentCount += 1;
      sub.nextRetryAt = sub.failedPaymentCount < 4
        ? new Date(now.getTime() + getNextRetryDelay(sub.failedPaymentCount))
        : null;
      await sub.save();

      log.warn({ tenantId: String(sub.tenantId), failCount: sub.failedPaymentCount }, "Payment retry failed");
    }
  }
}

/**
 * Phase 4: Dunning email sequence.
 * Before renewal:  T-7, T-3, T-1
 * After failure:   T+1, T+3, T+7 (during grace period)
 */
async function sendDunningReminders(now: Date) {
  // Pre-renewal reminders
  const active = await Subscription.find({ status: "ACTIVE", autoRenew: true });
  for (const sub of active) {
    const days = daysBetween(now, sub.currentPeriodEnd);
    if ([7, 3, 1].includes(days)) {
      const email = await getOwnerEmail(sub.tenantId);
      await sendDunning(
        email,
        `Renewal in ${days} day${days > 1 ? "s" : ""}`,
        `<p>Your ${sub.planCode} subscription renews in ${days} day${days > 1 ? "s" : ""}.</p>`,
        `Renews in ${days} day${days > 1 ? "s" : ""}.`,
        `billing_t-${days}_${String(sub._id)}_${now.toISOString().slice(0, 10)}`,
      );
    }
  }

  // Post-failure dunning for GRACE subscriptions
  const grace = await Subscription.find({ status: "GRACE", graceUntil: { $gt: now } });
  for (const sub of grace) {
    if (!sub.graceUntil) continue;
    const graceStart = new Date(sub.graceUntil.getTime() - GRACE_DAYS * 86400000);
    const daysSinceFailure = daysBetween(graceStart, now);

    if ([1, 3, 7].includes(daysSinceFailure)) {
      const daysLeft = daysBetween(now, sub.graceUntil);
      const email = await getOwnerEmail(sub.tenantId);
      await sendDunning(
        email,
        `Payment overdue — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} until suspension`,
        `<p>Your payment is ${daysSinceFailure} day${daysSinceFailure !== 1 ? "s" : ""} overdue. ${daysLeft} day${daysLeft !== 1 ? "s" : ""} until suspension.</p>`,
        `Payment ${daysSinceFailure} days overdue. ${daysLeft} days until suspension.`,
        `billing_t+${daysSinceFailure}_${String(sub._id)}_${now.toISOString().slice(0, 10)}`,
      );
    }
  }
}

/**
 * Phase 5: Auto-downgrade expired subscriptions to FREE plan.
 * Runs 7 days after expiry (grace ended + 7 days = ~14 days total).
 */
async function autoDowngradeExpired(now: Date) {
  const staleThreshold = new Date(now.getTime() - 7 * 86400000);
  const staleExpired = await Subscription.find({
    status: "EXPIRED",
    updatedAt: { $lte: staleThreshold },
    planCode: { $ne: "FREE" },
  });

  for (const sub of staleExpired) {
    const oldPlan = sub.planCode;
    sub.planCode = "FREE";
    sub.seats = 1;
    sub.entitlements = { sso: false, analytics: false, api: false, realtime: false, seats: 1, ticketLimit: 50 };
    sub.status = "ACTIVE";
    sub.autoRenew = false;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = new Date(now.getTime() + 365 * 86400000);
    sub.graceUntil = null;
    sub.failedPaymentCount = 0;
    sub.nextRetryAt = null;
    await sub.save();

    const email = await getOwnerEmail(sub.tenantId);
    await sendDunning(
      email,
      "Account downgraded to Free plan",
      `<p>Your ${oldPlan} subscription was not renewed and has been downgraded to the Free plan.</p>`,
      `Downgraded to Free plan from ${oldPlan}.`,
      `billing_downgrade_${String(sub._id)}_${Date.now()}`,
    );

    log.info({ tenantId: String(sub.tenantId), from: oldPlan }, "Auto-downgraded to FREE");
  }
}

// ─── Cron Scheduling ─────────────────────────────────────────────────

let cronInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the billing worker on a recurring schedule.
 * Default: every 6 hours.
 */
/**
 * One scheduled sweep, held under a fleet-wide lock.
 *
 * Every API replica starts this cron, and the sweep renews subscriptions and
 * raises invoices — so without the lock, N replicas bill N times. The lock is
 * taken here rather than inside runOnce() so that direct callers (the CLI entry
 * point, tests) keep working unconditionally.
 */
async function runScheduledSweep() {
  try {
    const { ran } = await withLock("api:billing", BILLING_LOCK_TTL_MS, () => runOnce());
    if (!ran) log.info("Billing sweep already running on another replica — skipped");
  } catch (err: any) {
    log.error({ err: err?.message }, "Billing run failed");
  }
}

export function startCron(intervalMs = Number(process.env.BILLING_CRON_INTERVAL_MS || 6 * 3600000)) {
  if (cronInterval) return;
  log.info({ intervalMs }, "Starting billing cron");
  void runScheduledSweep();
  cronInterval = setInterval(() => void runScheduledSweep(), intervalMs);
  cronInterval.unref();
}

export function stopCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      await connectMongo();
      await runOnce();
      log.info("Billing run complete");
      await disconnectMongo();
      process.exit(0);
    } catch (e) {
      log.error(e);
      process.exit(1);
    }
  })();
}

export { runOnce };
