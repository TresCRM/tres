/**
 * AI credit tracking and enforcement.
 * Each AI operation costs credits. Tenants have monthly limits.
 */
import { AiUsage } from "../../models/AiUsage";

const CREDIT_COSTS: Record<string, number> = {
  triage: 1,
  replies: 2,
  summaries: 1,
  knowledge: 3,
  newsletters: 10,
  anomaly: 1,
  copilot: 2,
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if tenant has enough credits for an AI operation.
 * Returns { allowed, remaining, used, limit }.
 */
export async function checkCredits(
  tenantId: string,
  operation: keyof typeof CREDIT_COSTS
): Promise<{ allowed: boolean; remaining: number; used: number; limit: number }> {
  const month = currentMonth();
  const cost = CREDIT_COSTS[operation] || 1;

  let usage = await AiUsage.findOne({ tenantId, month });
  if (!usage) {
    usage = await AiUsage.create({
      tenantId,
      month,
      creditsUsed: 0,
      creditsLimit: Number(process.env.AI_CREDITS_LIMIT) || 1000,
    });
  }

  const remaining = Math.max(0, usage.creditsLimit - usage.creditsUsed);
  // Soft limit: allow but warn (don't hard-block)
  return {
    allowed: true, // soft limit — always allow, track overage
    remaining: remaining - cost,
    used: usage.creditsUsed,
    limit: usage.creditsLimit,
  };
}

/**
 * Record credit consumption after a successful AI operation.
 */
export async function consumeCredits(
  tenantId: string,
  operation: keyof typeof CREDIT_COSTS
): Promise<void> {
  const month = currentMonth();
  const cost = CREDIT_COSTS[operation] || 1;

  await AiUsage.findOneAndUpdate(
    { tenantId, month },
    {
      $inc: {
        creditsUsed: cost,
        [`breakdown.${operation}`]: cost,
      },
      $setOnInsert: {
        creditsLimit: Number(process.env.AI_CREDITS_LIMIT) || 1000,
      },
    },
    { upsert: true }
  );
}

/**
 * Get current month's usage for a tenant.
 */
export async function getUsage(tenantId: string) {
  const month = currentMonth();
  return AiUsage.findOne({ tenantId, month }).lean();
}
