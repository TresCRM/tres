/**
 * @module billing/stripeProvider
 * Payment provider abstraction wrapping the Stripe SDK.
 *
 * Stripe credentials are optional — if STRIPE_SECRET_KEY is not set or the
 * `stripe` npm package is not installed, `getPaymentProvider()` returns null
 * so the rest of the app can operate in manual-billing mode.
 *
 * ------------------------------------------------------------------
 * Provider metadata fields that would be stored on the Subscription model:
 *   stripeCustomerId?: string;       // Stripe Customer ID (cus_xxx)
 *   stripeSubscriptionId?: string;   // Stripe Subscription ID (sub_xxx)
 * These live under the `provider` / entitlements mixed field today;
 * a future migration can promote them to first-class schema fields.
 * ------------------------------------------------------------------
 */

import type { SubscriptionStatus } from "../models/Subscription";
import type { PlanCode, Interval } from "./plans";
import { getPlanByCode, priceForInterval, monthsForInterval } from "./plans";

/* ---------- Stripe SDK (lazy, defensive) ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Stripe: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("stripe");
  Stripe = mod.default ?? mod;
} catch {
  // stripe package not installed — provider will be unavailable
}

/* ---------- Shared types ---------- */

export interface CheckoutSessionParams {
  planCode: PlanCode;
  interval: Interval;
  tenantId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
  /** Existing Stripe customer ID if the tenant already has one. */
  stripeCustomerId?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string | null;
}

export interface PortalSessionResult {
  url: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Minimal subset of a Stripe subscription object that we inspect when
 * mapping to our internal status. Keeps callers decoupled from Stripe types.
 */
export interface StripeSubscriptionLike {
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
}

export interface SyncResult {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  autoRenew: boolean;
}

/* ---------- Interface ---------- */

export interface PaymentProvider {
  /** Create a Stripe Checkout session for a new or upgraded subscription. */
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;

  /** Create a Billing Portal session so the customer can manage payment methods. */
  createPortalSession(customerId: string): Promise<PortalSessionResult>;

  /** Verify a webhook payload signature and return the parsed event. */
  constructWebhookEvent(payload: string | Buffer, signature: string): WebhookEvent;

  /** Map a Stripe subscription object to our internal subscription status. */
  syncSubscriptionStatus(stripeSubscription: StripeSubscriptionLike): SyncResult;
}

/* ---------- Stripe status mapping ---------- */

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "EXPIRED",
  incomplete: "PAST_DUE",
  incomplete_expired: "EXPIRED",
  paused: "EXPIRED",
};

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  return STRIPE_STATUS_MAP[stripeStatus] ?? "EXPIRED";
}

/* ---------- Interval helpers ---------- */

function intervalToStripeRecurring(interval: Interval): { interval: "month" | "year"; interval_count: number } {
  switch (interval) {
    case "MONTH":      return { interval: "month", interval_count: 1 };
    case "QUARTER":    return { interval: "month", interval_count: 3 };
    case "SEMIANNUAL": return { interval: "month", interval_count: 6 };
    case "ANNUAL":     return { interval: "year",  interval_count: 1 };
    default:           return { interval: "month", interval_count: 1 };
  }
}

/* ---------- Implementation ---------- */

class StripeProvider implements PaymentProvider {
  private stripe: any;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    if (!Stripe) throw new Error("stripe package is not installed");
    this.stripe = new Stripe(secretKey, { apiVersion: "2025-03-31.basil" });
    this.webhookSecret = webhookSecret;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const { planCode, interval, tenantId, tenantSlug, successUrl, cancelUrl, stripeCustomerId } = params;

    const plan = getPlanByCode(planCode);
    if (!plan) throw new Error(`Unknown or inactive plan: ${planCode}`);
    if (plan.isCustom) throw new Error(`Custom plans cannot be purchased via self-serve checkout`);

    const priceCents = priceForInterval(plan, interval);
    const months = monthsForInterval(interval);
    const recurring = intervalToStripeRecurring(interval);

    const sessionConfig: Record<string, unknown> = {
      mode: "subscription" as const,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.name} (${interval.toLowerCase()})`,
              metadata: { planCode, interval, tenantId },
            },
            unit_amount: priceCents,
            recurring,
          },
          quantity: 1,
        },
      ],
      metadata: { tenantId, tenantSlug, planCode, interval },
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { tenantId, tenantSlug, planCode, interval },
      },
    };

    if (stripeCustomerId) {
      sessionConfig.customer = stripeCustomerId;
    }

    const session = await this.stripe.checkout.sessions.create(sessionConfig as any);

    return {
      sessionId: session.id,
      url: session.url ?? null,
    };
  }

  async createPortalSession(customerId: string): Promise<PortalSessionResult> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
    });
    return { url: session.url };
  }

  constructWebhookEvent(payload: string | Buffer, signature: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return {
      id: event.id,
      type: event.type,
      data: { object: event.data.object as unknown as Record<string, unknown> },
    };
  }

  syncSubscriptionStatus(sub: StripeSubscriptionLike): SyncResult {
    const status = mapStripeStatus(sub.status);
    return {
      status,
      currentPeriodStart: new Date((sub.current_period_start ?? 0) * 1000),
      currentPeriodEnd: new Date((sub.current_period_end ?? 0) * 1000),
      canceledAt: sub.cancel_at_period_end ? new Date() : null,
      autoRenew: !sub.cancel_at_period_end,
    };
  }
}

/* ---------- Factory ---------- */

let cached: PaymentProvider | null | undefined;

/**
 * Returns a configured Stripe payment provider, or `null` if Stripe is not
 * available (missing env vars or missing `stripe` npm package).
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!Stripe || !secretKey) {
    cached = null;
    return null;
  }

  try {
    cached = new StripeProvider(secretKey, webhookSecret ?? "");
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
