import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Subscription } from "../models/Subscription";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../docs/swagger";
import { 
  getPlanByCode, 
  priceForInterval, 
  monthsForInterval, 
  PlanCode, 
  Interval 
} from "../billing/plans";
import { sendEmail } from "../services/mailer";
import { addMonths } from "date-fns";
import { cachePublic } from "../middlewares/cacheControl";

extendZodWithOpenApi(z);

export const subscriptionsRouter = Router();

/* ---------- Zod schemas (OpenAPI-friendly) ---------- */

const ObjectIdString = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId")
  .openapi({ example: "6512bd43d9caa6e02c990b0a" });

const IsoDateTime = z.iso.datetime().openapi({ format: "date-time", example: "2025-10-12T00:00:00Z" });

const SubscriptionStatusSchema = z.enum([
  "ACTIVE",
  "PAST_DUE",
  "GRACE",
  "EXPIRED",
  "CANCELED",
]);

const Intervals = z.enum([
  "MONTH",
  "QUARTER",
  "SEMIANNUAL",
  "ANNUAL",
]);

const EntitlementsSchema = z
  .record(z.string(), z.unknown())
  .openapi({
    type: "object",
    additionalProperties: true,
    example: { sso: true, analytics: { enabled: true }, seats: 10 },
  });

export const SubscribeBody = z
  .object({
    // validate as string here; convert to ObjectId in handler with asObjectId()
    tenantId: ObjectIdString,
    planCode: z.string().min(1).max(34),
    status: SubscriptionStatusSchema,
    interval: Intervals,
    currentPeriodStart: IsoDateTime,
    currentPeriodEnd: IsoDateTime,
    graceUntil: IsoDateTime.nullish(),
    canceledAt: IsoDateTime.nullish(),
    provider: z.string().min(1),
    lastPaymentAt: IsoDateTime.nullish(),
    seats: z.number().int().min(1).default(1),
    failedPaymentCount: z.number().int().min(0).default(0),
    entitlements: EntitlementsSchema.default({}),
  })
  .openapi("SubscribeBody");

/* ---------- OpenAPI registration ---------- */

registry.registerPath({
  tags: ["Subscriptions"],
  method: "post",
  path: "/api/v1/subscriptions",
  description: "Create/update tenant subscription (MVP manual activation).",
  request: {
    body: { content: { "application/json": { schema: SubscribeBody } } },
  },
  responses: {
    201: {
      description: "Upserted",
      content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
    },
    400: { description: "Validation" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
});

registry.registerPath({
  tags: ["Subscriptions"],
  method: "post",
  path: "/api/v1/subscriptions/pay",
  description: "Simulate payment/renewal for current or next period.",
  responses: {
    201: { description: "Paid" },
    400: { description: "Invalid" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
});

registry.registerPath({
  tags: ["Subscriptions"],
  method: "post",
  path: "/api/v1/subscriptions/cancel",
  description: "Cancel at period end.",
  responses: {
    200: { description: "Canceled" },
    400: { description: "Invalid" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
});

registry.registerPath({
  tags: ["Subscriptions"],
  method: "get",
  path: "/api/v1/subscriptions/plans",
  description: "List active plans",
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Subscriptions"],
  method: "get",
  path: "/api/v1/subscriptions/me",
  description: "Current subscription for tenant",
  responses: { 200: { description: "OK" } },
});

/* ---------- Routes ---------- */

// Upsert/activate — simple plan activation (manual provider)
subscriptionsRouter.post(
  "/",
  requireAuth,
  requirePermission("BILLING_MANAGE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const body = z.object({
        planCode: z.string().min(1),
        prepayMonths: z.number().int().min(1).max(12).optional().default(1),
        interval: z.enum(["MONTH", "QUARTER", "SEMIANNUAL", "ANNUAL"]).optional().default("MONTH"),
      }).parse(req.body);

      const plan = getPlanByCode(body.planCode as PlanCode);
      if (!plan) {
        return res.status(400).json({ error: "invalid_plan", message: "Plan not found" });
      }

      const now = new Date();
      const currentPeriodEnd = addMonths(now, body.prepayMonths);

      const sub = await Subscription.findOneAndUpdate(
        { tenantId: asObjectId(auth.tid) },
        {
          planCode: plan.code,
          interval: body.interval,
          seats: plan.seats,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd,
          graceUntil: null,
          entitlements: plan.entitlements,
          updatedAt: now,
          lastPaymentAt: now,
          failedPaymentCount: 0,
          provider: "manual",
        },
        { new: true, upsert: true }
      );

      res.status(201).json({ data: sub });
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
  }
);

// Simulate a payment / renewal
subscriptionsRouter.post(
  "/pay",
  requireAuth,
  requirePermission("BILLING_MANAGE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) });
    if (!sub) return res.status(400).json({ error: "no_subscription" });

    const plan = getPlanByCode(sub.planCode as PlanCode);
    if (!plan) return res.status(400).json({ error: "invalid_plan" });

    const months = monthsForInterval(sub.interval as Interval);
    const now = new Date();
    const start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const end = new Date(start.getTime());
    end.setMonth(end.getMonth() + months);

    sub.status = "ACTIVE";
    sub.currentPeriodStart = start;
    sub.currentPeriodEnd = end;
    sub.graceUntil = null;
    sub.lastPaymentAt = now;
    sub.failedPaymentCount = 0;
    sub.entitlements = plan.entitlements;
    await sub.save();

    if (!process.env.EMAILS_DISABLED) {
      await sendEmail({
        to: process.env.BILLING_FROM_EMAIL || "owner@trescrm.local",
        subject: "Payment received",
        html: `<p>Thanks! Your ${plan.name} plan is active until ${end.toISOString()}.</p>`,
        text: `Thanks! Active until ${end.toISOString()}`,
        messageKey: `billing_paid_${String(sub._id)}_${Date.now()}`,
      });
    }

    res
      .status(201)
      .json({ data: sub, amountCents: priceForInterval(plan, sub.interval as Interval) });
  }
);

// Cancel at period end
subscriptionsRouter.post(
  "/cancel",
  requireAuth,
  requirePermission("BILLING_MANAGE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) });
    if (!sub) return res.status(400).json({ error: "no_subscription" });
    sub.status = "CANCELED";
    sub.canceledAt = new Date();
    await sub.save();
    res.json({ data: sub });
  }
);

// Me
subscriptionsRouter.get("/me", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) }).lean();
  res.json({ data: sub });
});

// Plans — merge canonical PLANS with admin DB overrides
subscriptionsRouter.get("/plans", cachePublic(300), async (_req, res) => {
  const { PLANS, ADD_ONS } = await import("../billing/plans");
  const { Plan } = await import("../models/Plan");

  const overrides: any[] = await Plan.find({}).lean().catch(() => [] as any[]);
  const overrideMap = new Map<string, any>(overrides.map((o: any) => [String(o.code), o]));

  const merged = PLANS.map(canonical => {
    const override = overrideMap.get(canonical.code);
    if (!override) return canonical;
    return {
      ...canonical,
      ...(override.name !== undefined && { name: override.name }),
      ...(override.tagline !== undefined && { tagline: override.tagline }),
      ...(override.seats !== undefined && { seats: override.seats }),
      ...(override.priceCentsPerSeat !== undefined && { priceCentsPerSeat: override.priceCentsPerSeat }),
      ...(override.priceCentsMonthly !== undefined && { priceCentsMonthly: override.priceCentsMonthly }),
      ...(override.active !== undefined && { active: override.active }),
      ...(override.isCustom !== undefined && { isCustom: override.isCustom }),
      entitlements: { ...canonical.entitlements, ...(override.entitlements || {}) },
    };
  });

  res.json({
    data: merged.filter(p => p.active && !p.isLegacy),
    addons: ADD_ONS,
  });
});

// ─── Paystack Integration Endpoints ──────────────────────────────────

// POST /api/v1/subscriptions/checkout — initialize Paystack transaction
subscriptionsRouter.post(
  "/checkout",
  requireAuth,
  requirePermission("BILLING_MANAGE"),
  async (req, res) => {
    const { getPaymentProvider } = await import("../billing/paystackProvider");
    const provider = getPaymentProvider();
    if (!provider) {
      return res.status(503).json({ error: "payment_provider_unavailable", message: "Payment provider not configured" });
    }

    const auth = (req as AuthRequest).auth;
    const body = z.object({
      planCode: z.string().min(1),
      interval: z.enum(["MONTH", "QUARTER", "SEMIANNUAL", "ANNUAL"]).default("MONTH"),
      email: z.string().email(),
      callbackUrl: z.string().url(),
    }).parse(req.body);

    const existingSub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) }).lean();

    try {
      const result = await provider.initializeTransaction({
        planCode: body.planCode as any,
        interval: body.interval as any,
        tenantId: auth.tid,
        tenantSlug: "",
        email: body.email,
        callbackUrl: body.callbackUrl,
        paystackCustomerCode: existingSub?.paystackCustomerCode || undefined,
      });
      res.json({ data: result });
    } catch (err: any) {
      res.status(400).json({ error: "checkout_failed", message: err.message });
    }
  },
);

// POST /api/v1/subscriptions/verify — verify Paystack transaction and activate subscription
subscriptionsRouter.post(
  "/verify",
  requireAuth,
  requirePermission("BILLING_MANAGE"),
  async (req, res) => {
    const { getPaymentProvider } = await import("../billing/paystackProvider");
    const provider = getPaymentProvider();
    if (!provider) {
      return res.status(503).json({ error: "payment_provider_unavailable" });
    }

    const auth = (req as AuthRequest).auth;
    const { reference } = z.object({ reference: z.string().min(1) }).parse(req.body);

    try {
      const data = await provider.verifyTransaction(reference);
      if (data.status !== "success") {
        return res.status(400).json({ error: "payment_not_successful", status: data.status });
      }

      // Extract plan info from transaction metadata
      const meta = data.metadata || {};
      const planCode = meta.planCode || meta.custom_fields?.find((f: any) => f.variable_name === "plan")?.value;
      const interval = (meta.interval as string) || "MONTH";

      if (planCode) {
        const plan = getPlanByCode(planCode as PlanCode);
        if (plan) {
          const now = new Date();
          const months = monthsForInterval(interval as Interval);
          const currentPeriodEnd = addMonths(now, months);

          await Subscription.findOneAndUpdate(
            { tenantId: asObjectId(auth.tid) },
            {
              planCode: plan.code,
              interval,
              seats: plan.seats,
              status: "ACTIVE",
              currentPeriodStart: now,
              currentPeriodEnd,
              graceUntil: null,
              entitlements: plan.entitlements,
              updatedAt: now,
              lastPaymentAt: now,
              failedPaymentCount: 0,
              provider: "paystack",
              paystackCustomerCode: data.customer?.customer_code || undefined,
            },
            { new: true, upsert: true }
          );
        }
      }

      res.json({ data: { verified: true, reference: data.reference, amount: data.amount, planCode } });
    } catch (err: any) {
      res.status(400).json({ error: "verification_failed", message: err.message });
    }
  },
);
