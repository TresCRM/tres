/**
 * @module billing/plans
 * Subscription plan catalog aligned with PRD pricing.
 */

export type PlanCode =
  | "FREE"
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
  seats: number;
  ticketLimit: number | null; // null = unlimited
}>;

export interface Plan {
  code: PlanCode;
  name: string;
  seats: number;
  priceCentsMonthly: number;
  active: boolean;
  entitlements: Entitlements;
  prepayPrices?: {
    price3Cents?: number;   // 3-month total
    price6Cents?: number;   // 6-month total
    price12Cents?: number;  // 12-month total
  };
  isCustom?: boolean;        // requires sales contact
}

export const PLANS: Plan[] = [
  {
    code: "FREE", name: "Free", seats: 1, priceCentsMonthly: 0, active: true,
    entitlements: { sso: false, analytics: false, api: false, realtime: false, seats: 1, ticketLimit: 50 },
  },
  {
    code: "IND-1", name: "Individual", seats: 1, priceCentsMonthly: 900, active: true,
    entitlements: { sso: false, analytics: false, api: true, realtime: true, seats: 1, ticketLimit: null },
    prepayPrices: { price3Cents: 2500, price6Cents: 4800, price12Cents: 9000 },
  },
  {
    code: "CO-20", name: "Company 20", seats: 20, priceCentsMonthly: 19900, active: true,
    entitlements: { sso: false, analytics: true, api: true, realtime: true, seats: 20, ticketLimit: null },
  },
  {
    code: "CO-50", name: "Company 50", seats: 50, priceCentsMonthly: 44900, active: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 50, ticketLimit: null },
  },
  {
    code: "CO-100", name: "Company 100", seats: 100, priceCentsMonthly: 79900, active: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 100, ticketLimit: null },
  },
  {
    code: "CO-250", name: "Company 250", seats: 250, priceCentsMonthly: 169900, active: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 250, ticketLimit: null },
  },
  {
    code: "CO-500", name: "Company 500", seats: 500, priceCentsMonthly: 299900, active: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 500, ticketLimit: null },
  },
  {
    code: "CO-1000", name: "Company 1000+", seats: 1000, priceCentsMonthly: 0, active: true, isCustom: true,
    entitlements: { sso: true, analytics: true, api: true, realtime: true, seats: 1000, ticketLimit: null },
  },
];

export const PLAN_META: Record<PlanCode, { seats: number; entitlements: Record<string, any> }> = Object.fromEntries(
  PLANS.map(p => [p.code, { seats: p.seats, entitlements: p.entitlements }])
) as any;

export function resolvePlan(code: string) {
  return PLAN_META[code as PlanCode] || null;
}

export function getPlanByCode(code: PlanCode | string) {
  return PLANS.find(p => p.code === code && p.active) || null;
}

export function monthsForInterval(i: Interval) {
  return i === "MONTH" ? 1 : i === "QUARTER" ? 3 : i === "SEMIANNUAL" ? 6 : 12;
}

export function priceForInterval(plan: Plan, interval: Interval) {
  if (plan.isCustom) return 0; // custom plans require sales contact

  const months = monthsForInterval(interval);

  // Use explicit prepay prices if available
  if (plan.prepayPrices) {
    if (interval === "QUARTER" && plan.prepayPrices.price3Cents != null) return plan.prepayPrices.price3Cents;
    if (interval === "SEMIANNUAL" && plan.prepayPrices.price6Cents != null) return plan.prepayPrices.price6Cents;
    if (interval === "ANNUAL" && plan.prepayPrices.price12Cents != null) return plan.prepayPrices.price12Cents;
  }

  // Default discount formula for company plans
  const factor = interval === "QUARTER" ? 0.95 : interval === "SEMIANNUAL" ? 0.92 : interval === "ANNUAL" ? 0.88 : 1.0;
  return Math.round(plan.priceCentsMonthly * months * factor);
}

/** Check if a plan has a ticket limit (free tier) */
export function getPlanTicketLimit(code: string): number | null {
  const plan = getPlanByCode(code);
  if (!plan) return null;
  return plan.entitlements.ticketLimit ?? null;
}
