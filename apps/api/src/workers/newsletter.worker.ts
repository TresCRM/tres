import { Ticket } from "../models/Ticket";
import { Tenant } from "../models/Tenant";
import { getAiProvider } from "../services/ai/ai-provider";
import { consumeCredits } from "../services/ai/ai-credits";
import pino from "pino";

const log = pino({ name: "newsletter-worker" });

let timer: ReturnType<typeof setInterval> | null = null;

interface PeriodStats {
  totalCreated: number;
  totalClosed: number;
  totalOpen: number;
  avgFirstResponseMs: number | null;
  topIssueTypes: { type: string; count: number }[];
}

async function gatherStats(
  tenantId: string,
  since: Date
): Promise<PeriodStats> {
  const now = new Date();

  const [totalCreated, totalClosed, totalOpen] = await Promise.all([
    Ticket.countDocuments({ tenantId, createdAt: { $gte: since } }),
    Ticket.countDocuments({
      tenantId,
      createdAt: { $gte: since },
      status: { $in: ["CLOSED", "RESOLVED"] },
    }),
    Ticket.countDocuments({
      tenantId,
      createdAt: { $gte: since },
      status: { $nin: ["CLOSED", "RESOLVED"] },
    }),
  ]);

  // Average first response time
  const responseTimeAgg = await Ticket.aggregate([
    {
      $match: {
        tenantId,
        createdAt: { $gte: since },
        "sla.firstRespondedAt": { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        responseTime: {
          $subtract: ["$sla.firstRespondedAt", "$createdAt"],
        },
      },
    },
    { $group: { _id: null, avg: { $avg: "$responseTime" } } },
  ]);

  const avgFirstResponseMs = responseTimeAgg[0]?.avg ?? null;

  // Top 3 issue types
  const issueTypeAgg = await Ticket.aggregate([
    {
      $match: {
        tenantId,
        createdAt: { $gte: since },
        "aiTriage.issueType": { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$aiTriage.issueType", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);

  const topIssueTypes = issueTypeAgg.map(
    (e: { _id: string; count: number }) => ({
      type: e._id,
      count: e.count,
    })
  );

  return { totalCreated, totalClosed, totalOpen, avgFirstResponseMs, topIssueTypes };
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "N/A";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function buildStatsNewsletter(
  tenantName: string,
  periodLabel: string,
  stats: PeriodStats
): string {
  const issueList =
    stats.topIssueTypes.length > 0
      ? stats.topIssueTypes
          .map((t, i) => `  ${i + 1}. ${t.type} (${t.count} tickets)`)
          .join("\n")
      : "  No categorized issues";

  return [
    `${tenantName} — ${periodLabel} Support Digest`,
    "=".repeat(50),
    "",
    `Tickets created: ${stats.totalCreated}`,
    `Tickets closed:  ${stats.totalClosed}`,
    `Still open:      ${stats.totalOpen}`,
    `Avg first response time: ${formatDuration(stats.avgFirstResponseMs)}`,
    "",
    "Top issue types:",
    issueList,
  ].join("\n");
}

async function processNewsletters() {
  try {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const dayOfMonth = now.getUTCDate();

    const isWeekly = dayOfWeek === 0;
    const isMonthly = dayOfMonth === 1;

    if (!isWeekly && !isMonthly) {
      log.debug("Not a newsletter day, skipping");
      return;
    }

    const periodLabel = isMonthly ? "Monthly" : "Weekly";
    const since = isMonthly
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1) // start of previous month
      : new Date(now.getTime() - 7 * 86400000); // last 7 days

    const tenants = await Tenant.find({ isActive: true }).lean();

    for (const tenant of tenants) {
      // Skip if newsletters are explicitly disabled
      if (tenant.aiFeatures?.newsletters === false) continue;

      const tenantId = String(tenant._id);
      const tenantName = tenant.branding?.name || tenant.slug;
      const stats = await gatherStats(tenantId, since);

      // Skip if no activity at all
      if (stats.totalCreated === 0) {
        log.debug({ tenantId }, "No tickets in period, skipping newsletter");
        continue;
      }

      let newsletterContent: string;
      const provider = getAiProvider();

      if (provider) {
        try {
          const prompt = [
            `Generate a short, professional newsletter digest for a support team.`,
            `Company: ${tenantName}`,
            `Period: ${periodLabel} (${since.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)})`,
            ``,
            `Stats:`,
            `- Tickets created: ${stats.totalCreated}`,
            `- Tickets closed: ${stats.totalClosed}`,
            `- Still open: ${stats.totalOpen}`,
            `- Average first response time: ${formatDuration(stats.avgFirstResponseMs)}`,
            `- Top issue types: ${stats.topIssueTypes.map((t) => `${t.type} (${t.count})`).join(", ") || "None categorized"}`,
            ``,
            `Write a brief 3-5 paragraph newsletter that:`,
            `1. Summarizes the key metrics`,
            `2. Highlights any notable trends`,
            `3. Provides a brief actionable recommendation`,
            `Keep the tone professional but approachable. No markdown headers.`,
          ].join("\n");

          newsletterContent = await provider.complete(prompt, {
            maxTokens: 512,
            temperature: 0.7,
            systemPrompt:
              "You are a support team newsletter writer. Be concise and data-driven.",
          });

          await consumeCredits(tenantId, "newsletters");
        } catch (aiErr) {
          log.warn(
            { tenantId, err: aiErr },
            "AI newsletter generation failed, falling back to stats-only"
          );
          newsletterContent = buildStatsNewsletter(
            tenantName,
            periodLabel,
            stats
          );
        }
      } else {
        newsletterContent = buildStatsNewsletter(
          tenantName,
          periodLabel,
          stats
        );
      }

      // For now, log the newsletter content (email delivery is optional)
      log.info(
        { tenantId, periodLabel, contentLength: newsletterContent.length },
        `[newsletter] Generated newsletter for tenant ${tenantId}`
      );
      log.debug({ tenantId, content: newsletterContent }, "Newsletter content");
    }
  } catch (err) {
    log.error({ err }, "Newsletter worker tick failed");
  }
}

export function startNewsletterCron(intervalMs = 86400000) {
  log.info({ intervalMs }, "Starting newsletter cron");
  processNewsletters(); // run immediately
  timer = setInterval(processNewsletters, intervalMs);
}

export function stopNewsletterCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info("Newsletter cron stopped");
  }
}
