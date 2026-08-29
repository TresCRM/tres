/**
 * @module billing/plans
 * Subscription plan catalog aligned with BUSINESS_UPGRADED_PLAN.md.
 *
 * New 6-plan structure (per-seat pricing):
 *   FREE      — $0/forever, 1 seat, 50 lifetime tickets
 *   STARTER   — $5/seat/mo, up to 5 seats
 *   TEAM      — $9/seat/mo, up to 20 seats
 *   BUSINESS  — $15/seat/mo, up to 100 seats
 *   ADVANCED  — $25/seat/mo, up to 500 seats, AI included
 *   ENTERPRISE — custom, unlimited seats
 *
 * Legacy codes (IND-1, CO-20, CO-50, CO-100, CO-250, CO-500, CO-1000) are kept as aliases
 * for existing subscriptions but are not shown on the pricing page (active: false for signup).
 */

export type PlanCode =
  // New canonical plans
  | "FREE"
  | "STARTER"
  | "TEAM"
  | "BUSINESS"
  | "ADVANCED"
  | "ENTERPRISE"
  // Legacy codes (kept for backward compat with existing subscriptions)
  | "IND-1"
  | "CO-20"
  | "CO-50"
  | "CO-100"
  | "CO-250"
  | "CO-500"
  | "CO-1000";

export type Interval =
  | "MONTH"
  | "QUARTER"
  | "SEMIANNUAL"
  | "ANNUAL";

type Entitlements = Partial<{
  sso: boolean;
  analytics: boolean;
  api: boolean;
  realtime: boolean;
  liveChat: boolean;
  videoCalls: boolean;
  aiFeatures: boolean;
  customSubdomain: boolean;
  brandedPortal: boolean;
  customFields: boolean;
  slaPolicies: boolean;
  internalMessaging: boolean;
  prioritySupport: boolean;
  seats: number;
  maxSeats: number;      // cap on seat count (not additional seats beyond default)
  ticketLimit: number | null; // null = unlimited
  aiCreditsMonthly: number;
  videoMinutesMonthly: number;
}>;

export interface Plan {
  code: PlanCode;
  name: string;
  tagline?: string;
  seats: number;                    // included seats
  priceCentsPerSeat: number;        // per-seat monthly price in cents
  priceCentsMonthly: number;        // legacy flat monthly price (for old plans; derived for new)
  active: boolean;                  // shown on pricing page
  isLegacy?: boolean;               // hidden from new signups but billing still works
  isCustom?: boolean;               // requires sales contact
  entitlements: Entitlements;
  prepayPrices?: {
    price3Cents?: number;   // 3-month total
    price6Cents?: number;   // 6-month total
    price12Cents?: number;  // 12-month total
  };
}

// ─── New Canonical Plans (6) ─────────────────────────

export const PLANS: Plan[] = [
  {
    code: "FREE",
    name: "Free",
    tagline: "Professional support for solo operators",
    seats: 1,
    priceCentsPerSeat: 0,
    priceCentsMonthly: 0,
    active: true,
    entitlements: {
      sso: false, analytics: false, api: false, realtime: false,
      liveChat: false, videoCalls: false, aiFeatures: false,
      customSubdomain: false, brandedPortal: false, customFields: false,
      slaPolicies: false, internalMessaging: false, prioritySupport: false,
      seats: 1, maxSeats: 1, ticketLimit: 50, aiCreditsMonthly: 0, videoMinutesMonthly: 0,
    },
  },
  {
    code: "STARTER",
    name: "Starter",
    tagline: "Small teams getting organized",
    seats: 5,
    priceCentsPerSeat: 500,          // $5/seat/mo
    priceCentsMonthly: 500,          // fallback for single-seat calc
    active: true,
    entitlements: {
      sso: false, analytics: false, api: true, realtime: true,
      liveChat: false, videoCalls: false, aiFeatures: false,
      customSubdomain: false, brandedPortal: false, customFields: false,
      slaPolicies: false, internalMessaging: true, prioritySupport: false,
      seats: 5, maxSeats: 5, ticketLimit: null, aiCreditsMonthly: 0, videoMinutesMonthly: 0,
    },
  },
  {
    code: "TEAM",
    name: "Team",
    tagline: "Growing teams with active support",
    seats: 20,
    priceCentsPerSeat: 900,          // $9/seat/mo
    priceCentsMonthly: 900,
    active: true,
    entitlements: {
      sso: false, analytics: true, api: true, realtime: true,
      liveChat: true, videoCalls: false, aiFeatures: false,
      customSubdomain: false, brandedPortal: false, customFields: true,
      slaPolicies: true, internalMessaging: true, prioritySupport: false,
      seats: 20, maxSeats: 20, ticketLimit: null, aiCreditsMonthly: 0, videoMinutesMonthly: 0,
    },
  },
  {
    code: "BUSINESS",
    name: "Business",
    tagline: "Companies needing branded experience",
    seats: 100,
    priceCentsPerSeat: 1500,         // $15/seat/mo
    priceCentsMonthly: 1500,
    active: true,
    entitlements: {
      sso: false, analytics: true, api: true, realtime: true,
      liveChat: true, videoCalls: true, aiFeatures: false,
      customSubdomain: true, brandedPortal: true, customFields: true,
      slaPolicies: true, internalMessaging: true, prioritySupport: false,
      seats: 100, maxSeats: 100, ticketLimit: null, aiCreditsMonthly: 0, videoMinutesMonthly: 300,
    },
  },
  {
    code: "ADVANCED",
    name: "Advanced",
    tagline: "Organizations wanting AI + enterprise features",
    seats: 500,
    priceCentsPerSeat: 2500,         // $25/seat/mo
    priceCentsMonthly: 2500,
    active: true,
    entitlements: {
      sso: true, analytics: true, api: true, realtime: true,
      liveChat: true, videoCalls: true, aiFeatures: true,
      customSubdomain: true, brandedPortal: true, customFields: true,
      slaPolicies: true, internalMessaging: true, prioritySupport: true,
      seats: 500, maxSeats: 500, ticketLimit: null, aiCreditsMonthly: 5000, videoMinutesMonthly: 1000,
    },
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Large teams with compliance needs",
    seats: 1000,
    priceCentsPerSeat: 0,
    priceCentsMonthly: 0,
    active: true,
    isCustom: true,
    entitlements: {
      sso: true, analytics: true, api: true, realtime: true,
      liveChat: true, videoCalls: true, aiFeatures: true,
      customSubdomain: true, brandedPortal: true, customFields: true,
      slaPolicies: true, internalMessaging: true, prioritySupport: true,
      seats: 1000, maxSeats: -1, ticketLimit: null, aiCreditsMonthly: -1, videoMinutesMonthly: -1,
    },
  },

  // ─── Legacy Plans (hidden from pricing page, kept for backward compat) ──
  {
    code: "IND-1", name: "Individual (Legacy)", seats: 1, priceCentsPerSeat: 900, priceCentsMonthly: 900,
    active: false, isLegacy: true,
    entitlements: { sso: false, analytics: false, api: true, realtime: true, seats: 1, maxSeats: 1, ticketLimit: null },
    prepayPrices: { price3Cents: 2500, price6Cents: 4800, price12Cents: 9000 },
  },
  {
    code: "CO-20", name: "Company 20 (Legacy)", seats: 20, priceCentsPerSeat: 995, priceCentsMonthly: 19900,
    active: false, isLegacy: true,
    entitlements: { sso: false, analytics: true, api: true, realtime: true, seats: 20, maxSeats: 20, ticketLimit: null },
  },
  {
    code: "CO-50", name: "Company 50 (Legacy)", seats: 50, priceCentsPerSeat: 898, priceCentsMonthly: 44900,
    active: false, isLegacy: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 50, maxSeats: 50, ticketLimit: null },
  },
  {
    code: "CO-100", name: "Company 100 (Legacy)", seats: 100, priceCentsPerSeat: 799, priceCentsMonthly: 79900,
    active: false, isLegacy: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 100, maxSeats: 100, ticketLimit: null },
  },
  {
    code: "CO-250", name: "Company 250 (Legacy)", seats: 250, priceCentsPerSeat: 680, priceCentsMonthly: 169900,
    active: false, isLegacy: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 250, maxSeats: 250, ticketLimit: null },
  },
  {
    code: "CO-500", name: "Company 500 (Legacy)", seats: 500, priceCentsPerSeat: 600, priceCentsMonthly: 299900,
    active: false, isLegacy: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 500, maxSeats: 500, ticketLimit: null },
  },
  {
    code: "CO-1000", name: "Company 1000+ (Legacy)", seats: 1000, priceCentsPerSeat: 0, priceCentsMonthly: 0,
    active: false, isLegacy: true, isCustom: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 1000, maxSeats: -1, ticketLimit: null },
  },
];

// ─── Add-ons ─────────────────────────────────────────

export interface AddOn {
  code: string;
  name: string;
  description: string;
  priceCentsMonthly: number;
  unit?: string;           // e.g. "/seat", "/5000 credits"
  freeOnPlans?: PlanCode[]; // plans where this add-on is included free
}

export const ADD_ONS: AddOn[] = [
  { code: "extra_seat", name: "Extra Seat", description: "Additional team member beyond plan limit",
    priceCentsMonthly: 600, unit: "/seat/mo" },
  { code: "custom_smtp", name: "Custom SMTP Domain", description: "Branded email delivery from your domain",
    priceCentsMonthly: 2000, unit: "/mo" },
  { code: "priority_support", name: "Priority Support", description: "Direct support channel with 1hr response SLA",
    priceCentsMonthly: 14900, unit: "/mo", freeOnPlans: ["ADVANCED", "ENTERPRISE"] },
  { code: "sso_saml", name: "SSO / SAML", description: "Enterprise identity provider authentication",
    priceCentsMonthly: 9900, unit: "/mo", freeOnPlans: ["ADVANCED", "ENTERPRISE"] },
  { code: "premium_analytics", name: "Premium Analytics", description: "Deep reporting and custom dashboards",
    priceCentsMonthly: 9900, unit: "/mo", freeOnPlans: ["ADVANCED", "ENTERPRISE"] },
  { code: "ai_credits", name: "AI Credits Pack", description: "5,000 additional AI credits per month",
    priceCentsMonthly: 4900, unit: "/mo/5K credits", freeOnPlans: ["ADVANCED", "ENTERPRISE"] },
  { code: "video_minutes", name: "Video Minutes Pack", description: "300 additional video call minutes per month",
    priceCentsMonthly: 2900, unit: "/mo/300min" },
];

// ─── Helper Functions ─────────────────────────────────

export const PLAN_META: Record<PlanCode, { seats: number; entitlements: Record<string, any> }> = Object.fromEntries(
  PLANS.map(p => [p.code, { seats: p.seats, entitlements: p.entitlements }])
) as any;

export function resolvePlan(code: string) {
  return PLAN_META[code as PlanCode] || null;
}

export function getPlanByCode(code: PlanCode | string) {
  // Include legacy plans when looking up by code
  return PLANS.find(p => p.code === code) || null;
}

export function getActivePlans() {
  return PLANS.filter(p => p.active && !p.isLegacy);
}

export function monthsForInterval(i: Interval) {
  return i === "MONTH" ? 1 : i === "QUARTER" ? 3 : i === "SEMIANNUAL" ? 6 : 12;
}

/**
 * Calculate price for a plan given interval and seat count.
 * - FREE returns 0
 * - Custom (ENTERPRISE) returns 0 (contact sales)
 * - New per-seat plans: priceCentsPerSeat * seats * months * discount
 * - Legacy plans: use flat priceCentsMonthly * months * discount
 */
export function priceForInterval(plan: Plan, interval: Interval, seats?: number): number {
  if (plan.isCustom) return 0;
  if (plan.priceCentsMonthly === 0 && plan.priceCentsPerSeat === 0) return 0;

  const months = monthsForInterval(interval);

  // Legacy: explicit prepay prices
  if (plan.prepayPrices) {
    if (interval === "QUARTER" && plan.prepayPrices.price3Cents != null) return plan.prepayPrices.price3Cents;
    if (interval === "SEMIANNUAL" && plan.prepayPrices.price6Cents != null) return plan.prepayPrices.price6Cents;
    if (interval === "ANNUAL" && plan.prepayPrices.price12Cents != null) return plan.prepayPrices.price12Cents;
  }

  // Discount: MONTH=1.0, QUARTER=0.95 (5% off), SEMIANNUAL=0.90 (10% off), ANNUAL=0.80 (20% off)
  const factor = interval === "QUARTER" ? 0.95 : interval === "SEMIANNUAL" ? 0.90 : interval === "ANNUAL" ? 0.80 : 1.0;

  // New plans: per-seat pricing
  if (plan.priceCentsPerSeat > 0) {
    const seatCount = seats ?? plan.seats;
    return Math.round(plan.priceCentsPerSeat * seatCount * months * factor);
  }

  // Legacy plans: flat price
  return Math.round(plan.priceCentsMonthly * months * factor);
}

/** Check if a plan has a ticket limit (free tier) */
export function getPlanTicketLimit(code: string): number | null {
  const plan = getPlanByCode(code);
  if (!plan) return null;
  return plan.entitlements.ticketLimit ?? null;
}

/** Get all add-ons (optionally filtered by plan for free inclusions) */
export function getAddOns(planCode?: PlanCode) {
  if (!planCode) return ADD_ONS;
  return ADD_ONS.map(a => ({
    ...a,
    includedFree: a.freeOnPlans?.includes(planCode) ?? false,
  }));
}
