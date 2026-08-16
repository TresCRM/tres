/**
 * @module billing/paystackProvider
 * Payment provider abstraction wrapping the Paystack API.
 *
 * Paystack credentials are optional — if PAYSTACK_SECRET_KEY is not set,
 * `getPaymentProvider()` returns null so the app operates in manual-billing mode.
 *
 * Paystack flow:
 *  1. Initialize transaction → returns authorization_url (redirect user)
 *  2. User completes payment on Paystack checkout page
 *  3. Paystack sends webhook to /api/v1/webhooks/paystack
 *  4. We verify the transaction via API and activate subscription
 *
 * Provider metadata on Subscription model:
 *   paystackCustomerCode?: string;   // Paystack Customer code (CUS_xxx)
 *   paystackSubscriptionCode?: string; // Paystack Subscription code (SUB_xxx)
 */

import crypto from "crypto";
import type { SubscriptionStatus } from "../models/Subscription";
import type { PlanCode, Interval } from "./plans";
import { getPlanByCode, priceForInterval, monthsForInterval } from "./plans";

/* ---------- Shared types ---------- */

export interface CheckoutParams {
  planCode: PlanCode;
  interval: Interval;
  tenantId: string;
  tenantSlug: string;
  email: string;
  callbackUrl: string;
  /** Existing Paystack customer code if tenant already has one. */
  paystackCustomerCode?: string;
}

export interface CheckoutResult {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}

export interface WebhookEvent {
  event: string;
  data: Record<string, any>;
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
  /** Initialize a Paystack transaction for subscription checkout. */
  initializeTransaction(params: CheckoutParams): Promise<CheckoutResult>;

  /** Verify a completed transaction by reference. */
  verifyTransaction(reference: string): Promise<Record<string, any>>;

  /** Verify webhook signature (HMAC SHA-512). Returns parsed event or throws. */
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;

  /** Map Paystack subscription status to internal status. */
  syncSubscriptionStatus(paystackSub: Record<string, any>): SyncResult;
}

/* ---------- Paystack status mapping ---------- */

const PAYSTACK_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  "non-renewing": "ACTIVE",    // active but won't renew (user canceled)
  attention: "PAST_DUE",       // payment needs attention
  completed: "EXPIRED",        // subscription ran its course
  cancelled: "CANCELED",
};

function mapPaystackStatus(status: string): SubscriptionStatus {
  return PAYSTACK_STATUS_MAP[status] ?? "EXPIRED";
}

/* ---------- Implementation ---------- */

class PaystackProvider implements PaymentProvider {
  private secretKey: string;
  private baseUrl = "https://api.paystack.co";

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = await res.json();
    if (!json.status) {
      throw new Error(json.message || `Paystack API error: ${res.status}`);
    }
    return json.data;
  }

  async initializeTransaction(params: CheckoutParams): Promise<CheckoutResult> {
    const { planCode, interval, tenantId, tenantSlug, email, callbackUrl, paystackCustomerCode } = params;

    const plan = getPlanByCode(planCode);
    if (!plan) throw new Error(`Unknown or inactive plan: ${planCode}`);
    if (plan.isCustom) throw new Error("Custom plans cannot be purchased via self-serve checkout");

    const amountKobo = priceForInterval(plan, interval); // plans store cents, Paystack uses kobo (same unit)

    const payload: Record<string, any> = {
      email,
      amount: amountKobo,
      currency: "NGN",
      callback_url: callbackUrl,
      metadata: {
        tenantId,
        tenantSlug,
        planCode,
        interval,
        custom_fields: [
          { display_name: "Plan", variable_name: "plan", value: plan.name },
          { display_name: "Tenant", variable_name: "tenant", value: tenantSlug },
        ],
      },
      channels: ["card", "bank", "ussd", "bank_transfer"],
    };

    if (paystackCustomerCode) {
      payload.customer = paystackCustomerCode;
    }

    const data = await this.request("POST", "/transaction/initialize", payload);

    return {
      reference: data.reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
    };
  }

  async verifyTransaction(reference: string): Promise<Record<string, any>> {
    return this.request("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    const hash = crypto
      .createHmac("sha512", this.secretKey)
      .update(typeof payload === "string" ? payload : payload.toString("utf-8"))
      .digest("hex");

    if (hash !== signature) {
      throw new Error("Invalid Paystack webhook signature");
    }

    const body = typeof payload === "string" ? JSON.parse(payload) : JSON.parse(payload.toString("utf-8"));
    return {
      event: body.event,
      data: body.data,
    };
  }

  syncSubscriptionStatus(sub: Record<string, any>): SyncResult {
    const status = mapPaystackStatus(sub.status || "");
    const now = new Date();
    return {
      status,
      currentPeriodStart: sub.createdAt ? new Date(sub.createdAt) : now,
      currentPeriodEnd: sub.next_payment_date ? new Date(sub.next_payment_date) : now,
      canceledAt: sub.status === "cancelled" || sub.status === "non-renewing" ? new Date() : null,
      autoRenew: sub.status === "active",
    };
  }
}

/* ---------- Factory ---------- */

let cached: PaymentProvider | null | undefined;

/**
 * Returns a configured Paystack payment provider, or `null` if
 * PAYSTACK_SECRET_KEY is not set.
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached;

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  // Paystack secret keys must start with sk_test_ or sk_live_
  if (!secretKey || !secretKey.startsWith("sk_")) {
    cached = null;
    return null;
  }

  try {
    cached = new PaystackProvider(secretKey);
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
