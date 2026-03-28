export type PlanCode =
  | "IND-1"
  | "IN-1"                                  
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
}>;

export interface Plan {
  code: PlanCode;
  name: string;
  seats: number;
  priceCentsMonthly: number;
  active: boolean;
  entitlements: Entitlements;
}

export const PLANS: Plan[] = [
  { code:"IND-1",   name:"Individual", seats:1,    priceCentsMonthly: 1500, active:true, entitlements:{ api:true, realtime:true, seats:1 } },
  { code:"IN-1",   name:"Individual", seats:1,    priceCentsMonthly: 1500, active:true, entitlements:{ api:true, realtime:true, seats:1 } },
  { code:"CO-20",  name:"Company 20", seats:20,   priceCentsMonthly: 19900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:20 } },
  { code:"CO-50",  name:"Company 50", seats:50,   priceCentsMonthly: 39900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:50 } },
  { code:"CO-100", name:"Company 100",seats:100,  priceCentsMonthly: 69900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:100 } },
  { code:"CO-250", name:"Company 250",seats:250,  priceCentsMonthly:149900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:250 } },
  { code:"CO-500", name:"Company 500",seats:500,  priceCentsMonthly:249900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:500 } },
  { code:"CO-1000",name:"Company 1000",seats:1000,priceCentsMonthly:399900, active:true, entitlements:{ api:true, realtime:true, analytics:true, seats:1000 } },
];

export const PLAN_META: Record<PlanCode, { seats: number; entitlements: Record<string, boolean> }> = {
  "IND-1":   { seats: 1,    entitlements: { sso:false, analytics:false } },
  "IN-1":   { seats: 1,    entitlements: { sso:false, analytics:false } },
  "CO-20":   { seats: 20,   entitlements: { sso:false, analytics:true } },
  "CO-50":   { seats: 50,   entitlements: { sso:true,  analytics:true } },
  "CO-100":  { seats: 100,  entitlements: { sso:true,  analytics:true } },
  "CO-250":  { seats: 250,  entitlements: { sso:true,  analytics:true } },
  "CO-500":  { seats: 500,  entitlements: { sso:true,  analytics:true } },
  "CO-1000": { seats: 1000, entitlements: { sso:true,  analytics:true } },
};

export function resolvePlan(code: string) {
  return PLAN_META[code as PlanCode] || null;
}

export function getPlanByCode(code: PlanCode) {
  return PLANS.find(p => p.code === code && p.active) || null;
}

export function monthsForInterval(i: Interval) {
  return i === "MONTH" ? 1 : i === "QUARTER" ? 3 : i === "SEMIANNUAL" ? 6 : 12;
}

export function priceForInterval(plan: Plan, interval: Interval) {
  const months = monthsForInterval(interval);
  const monthly = plan.priceCentsMonthly;
  // Prepay discounts (example): quarter -5%, semi -8%, annual -12%
  const factor = interval === "QUARTER" ? 0.95 : interval === "SEMIANNUAL" ? 0.92 : interval === "ANNUAL" ? 0.88 : 1.0;
  return Math.round(monthly * months * factor);
}
