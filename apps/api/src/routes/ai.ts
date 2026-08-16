import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Tenant } from "../models/Tenant";
import { getAiProvider } from "../services/ai/ai-provider";
import { checkCredits, consumeCredits, getUsage } from "../services/ai/ai-credits";
import { logActivity } from "../utils/log";

export const aiRouter = Router();

// ─── Helpers ────────────────────────────────────────

function ensureProvider() {
  const provider = getAiProvider();
  if (!provider) return null;
  return provider;
}

async function ensureFeatureEnabled(tenantId: string, feature: string) {
  const tenant = await Tenant.findById(asObjectId(tenantId)).select("aiFeatures").lean();
  if (!tenant?.aiFeatures) return false;
  return !!(tenant.aiFeatures as any)[feature];
}

// ─── POST /triage/:ticketId — AI ticket triage ──────

aiRouter.post(
  "/triage/:ticketId",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const { ticketId } = req.params;

      const provider = ensureProvider();
      if (!provider) {
        return res.status(503).json({ error: "ai_unavailable", message: "AI provider is not configured." });
      }

      const enabled = await ensureFeatureEnabled(auth.tid, "triage");
      if (!enabled) {
        return res.status(403).json({ error: "feature_disabled", message: "AI triage is not enabled for this tenant." });
      }

      const credits = await checkCredits(auth.tid, "triage");
      if (!credits.allowed) {
        return res.status(429).json({ error: "credits_exhausted", remaining: credits.remaining });
      }

      const ticket = await Ticket.findOne({ _id: asObjectId(ticketId), tenantId: asObjectId(auth.tid) });
      if (!ticket) {
        return res.status(404).json({ error: "ticket_not_found" });
      }

      const prompt = [
        "Classify this support ticket. Respond in JSON with the following structure:",
        "{ \"issueType\": string, \"subType\": string, \"priority\": \"CRITICAL\" | \"HIGH\" | \"MEDIUM\" | \"LOW\", \"sentiment\": \"POSITIVE\" | \"NEUTRAL\" | \"NEGATIVE\" | \"URGENT\", \"language\": \"ISO 639-1 code\", \"suggestedGroup\": string, \"confidence\": number (0-1), \"reasoning\": string }",
        "",
        `Subject: ${ticket.subject}`,
        `Body: ${ticket.body}`,
      ].join("\n");

      const raw = await provider.complete(prompt, {
        systemPrompt: "You are an expert support ticket classifier. Analyze the ticket and respond with a JSON object only. Be precise and consistent.",
        jsonMode: true,
        temperature: 0.1,
      });

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(502).json({ error: "ai_parse_error", message: "Failed to parse AI response." });
      }

      ticket.aiTriage = {
        issueType: parsed.issueType,
        subType: parsed.subType,
        priority: parsed.priority,
        sentiment: parsed.sentiment,
        language: parsed.language,
        suggestedGroup: parsed.suggestedGroup,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        classifiedAt: new Date(),
      };
      await ticket.save();

      await consumeCredits(auth.tid, "triage");

      await logActivity(req, {
        action: "ai.triage",
        meta: { ticketId: ticket._id, confidence: parsed.confidence },
      });

      return res.json({ data: { triage: parsed, ticketId: ticket._id } });
    } catch (e: any) {
      return res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);

// ─── POST /suggest-reply/:ticketId — AI suggested reply ──

aiRouter.post(
  "/suggest-reply/:ticketId",
  requireAuth,
  requirePermission("COMMENT_CREATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const { ticketId } = req.params;

      const provider = ensureProvider();
      if (!provider) {
        return res.status(503).json({ error: "ai_unavailable", message: "AI provider is not configured." });
      }

      const enabled = await ensureFeatureEnabled(auth.tid, "suggestedReplies");
      if (!enabled) {
        return res.status(403).json({ error: "feature_disabled", message: "AI suggested replies is not enabled for this tenant." });
      }

      const credits = await checkCredits(auth.tid, "replies");
      if (!credits.allowed) {
        return res.status(429).json({ error: "credits_exhausted", remaining: credits.remaining });
      }

      const ticket = await Ticket.findOne({ _id: asObjectId(ticketId), tenantId: asObjectId(auth.tid) }).lean();
      if (!ticket) {
        return res.status(404).json({ error: "ticket_not_found" });
      }

      const comments = await Comment.find({
        ticketId: asObjectId(ticketId),
        tenantId: asObjectId(auth.tid),
        isInternal: false,
      })
        .sort({ createdAt: 1 })
        .lean();

      const thread = comments
        .map((c) => `[${c.isAgent ? "Agent" : "Customer"}]: ${c.body}`)
        .join("\n");

      const triageContext = ticket.aiTriage?.issueType
        ? `\nIssue type: ${ticket.aiTriage.issueType} / ${ticket.aiTriage.subType || "N/A"}`
        : "";

      const prompt = [
        `Subject: ${ticket.subject}`,
        triageContext,
        "",
        "Conversation:",
        thread || "(No replies yet)",
        "",
        "Draft a helpful reply to send to the customer.",
      ].join("\n");

      const suggestion = await provider.complete(prompt, {
        systemPrompt:
          "You are a professional support agent. Draft a helpful, empathetic reply to the customer. Be concise and actionable.",
        temperature: 0.4,
      });

      await consumeCredits(auth.tid, "replies");

      await logActivity(req, {
        action: "ai.suggest_reply",
        meta: { ticketId },
      });

      return res.json({ data: { suggestion, ticketId } });
    } catch (e: any) {
      return res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);

// ─── POST /summarize/:ticketId — AI ticket summary ──

const SummarizeBody = z.object({
  context: z.enum(["handover", "review", "resolution"]).default("review"),
});

aiRouter.post(
  "/summarize/:ticketId",
  requireAuth,
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const { ticketId } = req.params;
      const { context } = SummarizeBody.parse(req.body);

      const provider = ensureProvider();
      if (!provider) {
        return res.status(503).json({ error: "ai_unavailable", message: "AI provider is not configured." });
      }

      const enabled = await ensureFeatureEnabled(auth.tid, "summaries");
      if (!enabled) {
        return res.status(403).json({ error: "feature_disabled", message: "AI summaries is not enabled for this tenant." });
      }

      const credits = await checkCredits(auth.tid, "summaries");
      if (!credits.allowed) {
        return res.status(429).json({ error: "credits_exhausted", remaining: credits.remaining });
      }

      const ticket = await Ticket.findOne({ _id: asObjectId(ticketId), tenantId: asObjectId(auth.tid) }).lean();
      if (!ticket) {
        return res.status(404).json({ error: "ticket_not_found" });
      }

      const comments = await Comment.find({
        ticketId: asObjectId(ticketId),
        tenantId: asObjectId(auth.tid),
      })
        .sort({ createdAt: 1 })
        .lean();

      const thread = comments
        .map((c) => `[${c.isAgent ? "Agent" : "Customer"}${c.isInternal ? " (internal)" : ""}]: ${c.body}`)
        .join("\n");

      const contextInstructions: Record<string, string> = {
        handover: "This summary is for an agent handover. Focus on the current state, open questions, and next steps.",
        review: "This summary is for a manager reviewing the ticket. Focus on the overall issue, key details, and resolution path.",
        resolution: "This summary is for documenting the resolution. Focus on the problem, what was done, and the outcome.",
      };

      const prompt = [
        `Subject: ${ticket.subject}`,
        `Status: ${ticket.status}`,
        `Priority: ${ticket.priority}`,
        "",
        "Conversation:",
        thread || "(No comments)",
        "",
        contextInstructions[context],
        "",
        "Format your summary as:",
        "Issue: ...",
        "Key Details: ...",
        "Actions Taken: ...",
        "Current Status: ...",
        "Resolution: ...",
      ].join("\n");

      const summary = await provider.complete(prompt, {
        systemPrompt: "You are an expert support analyst. Summarize the ticket conversation clearly and concisely.",
        temperature: 0.2,
      });

      await consumeCredits(auth.tid, "summaries");

      await logActivity(req, {
        action: "ai.summarize",
        meta: { ticketId, context },
      });

      return res.json({ data: { summary, ticketId, context } });
    } catch (e: any) {
      return res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);

// ─── POST /copilot/insights — AI manager copilot ───

aiRouter.post(
  "/copilot/insights",
  requireAuth,
  requirePermission("SETTINGS_READ"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;

      const provider = ensureProvider();
      if (!provider) {
        return res.status(503).json({ error: "ai_unavailable", message: "AI provider is not configured." });
      }

      const enabled = await ensureFeatureEnabled(auth.tid, "copilot");
      if (!enabled) {
        return res.status(403).json({ error: "feature_disabled", message: "AI copilot is not enabled for this tenant." });
      }

      const credits = await checkCredits(auth.tid, "copilot");
      if (!credits.allowed) {
        return res.status(429).json({ error: "credits_exhausted", remaining: credits.remaining });
      }

      const tid = asObjectId(auth.tid);
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // Gather real-time data in parallel
      const [
        openCount,
        slaAtRisk,
        agentWorkloads,
        recentByPriority,
      ] = await Promise.all([
        // Open ticket count
        Ticket.countDocuments({ tenantId: tid, status: { $in: ["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER"] } }),

        // Tickets approaching SLA breach within 2 hours
        Ticket.countDocuments({
          tenantId: tid,
          status: { $nin: ["RESOLVED", "CLOSED"] },
          $or: [
            { "sla.firstResponseDue": { $lte: twoHoursFromNow, $gte: now }, "sla.firstRespondedAt": null },
            { "sla.resolutionDue": { $lte: twoHoursFromNow, $gte: now }, "sla.resolvedAt": null },
          ],
        }),

        // Agent workloads
        Ticket.aggregate([
          { $match: { tenantId: tid, status: { $in: ["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER"] }, assigneeId: { $ne: null } } },
          { $group: { _id: "$assigneeId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),

        // Recent ticket trends by priority (last 7 days)
        Ticket.aggregate([
          { $match: { tenantId: tid, createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } },
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
      ]);

      const workloadSummary = agentWorkloads.length > 0
        ? agentWorkloads.map((w: any) => `Agent ${w._id}: ${w.count} tickets`).join(", ")
        : "No assigned tickets";

      const trendSummary = recentByPriority.length > 0
        ? recentByPriority.map((t: any) => `${t._id}: ${t.count}`).join(", ")
        : "No recent tickets";

      const prompt = [
        "You are a support operations analyst. Based on the following real-time data, provide actionable insights and recommendations for the support manager.",
        "",
        `Open tickets: ${openCount}`,
        `Tickets approaching SLA breach (within 2 hours): ${slaAtRisk}`,
        `Agent workloads: ${workloadSummary}`,
        `Ticket trends (last 7 days by priority): ${trendSummary}`,
        "",
        "Provide 3-5 concise, actionable insights. Highlight risks, suggest resource allocation, and identify areas needing attention.",
      ].join("\n");

      const insights = await provider.complete(prompt, {
        systemPrompt: "You are a support operations copilot for managers. Be data-driven, concise, and actionable.",
        temperature: 0.3,
      });

      await consumeCredits(auth.tid, "copilot");

      await logActivity(req, {
        action: "ai.copilot_insights",
        meta: { openCount, slaAtRisk },
      });

      return res.json({ data: { insights, generatedAt: new Date() } });
    } catch (e: any) {
      return res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);

// ─── GET /usage — AI credit usage for current tenant ──

aiRouter.get("/usage", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const usage = await getUsage(auth.tid);
    return res.json({ data: usage || { creditsUsed: 0, creditsLimit: 0, breakdown: {} } });
  } catch (e: any) {
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});
