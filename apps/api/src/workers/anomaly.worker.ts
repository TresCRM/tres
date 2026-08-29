import { Ticket } from "../models/Ticket";
import { Tenant } from "../models/Tenant";
import { emitTicketEvent } from "../events/emitter";
import pino from "pino";

const log = pino({ name: "anomaly-worker" });

let timer: ReturnType<typeof setInterval> | null = null;

async function processAnomalyDetection(now = new Date()) {
  try {
    const tenants = await Tenant.find({ isActive: true }).lean();
    let anomalyCount = 0;

    for (const tenant of tenants) {
      // Skip if anomaly detection is explicitly disabled
      if (tenant.aiFeatures?.anomalyDetection === false) continue;

      const tenantId = String(tenant._id);
      const oneHourAgo = new Date(now.getTime() - 3600000);

      // ─── Volume spike detection ────────────────────
      const currentHourCount = await Ticket.countDocuments({
        tenantId: tenant._id,
        createdAt: { $gte: oneHourAgo },
      });

      // Average for the same hour over the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const currentHour = now.getUTCHours();

      const historicalCounts = await Ticket.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            createdAt: { $gte: thirtyDaysAgo, $lt: oneHourAgo },
          },
        },
        {
          $project: {
            hour: { $hour: "$createdAt" },
            dayBucket: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
          },
        },
        { $match: { hour: currentHour } },
        { $group: { _id: "$dayBucket", count: { $sum: 1 } } },
      ]);

      const totalHistorical = historicalCounts.reduce(
        (sum: number, d: { count: number }) => sum + d.count,
        0
      );
      const daysWithData = historicalCounts.length || 1; // avoid division by zero
      const averageCount = totalHistorical / daysWithData;

      if (currentHourCount > 2 * averageCount && averageCount > 0) {
        log.warn(
          { tenantId, currentCount: currentHourCount, averageCount },
          "Volume spike detected"
        );
        emitTicketEvent(tenantId, {
          event: "anomaly.volume_spike",
          tenantId,
          currentCount: currentHourCount,
          averageCount,
        });
        anomalyCount++;
      }

      // ─── Suspicious email patterns ────────────────
      const suspiciousEmails = await Ticket.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            createdAt: { $gte: oneHourAgo },
            customerEmail: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: "$customerEmail",
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gte: 10 } } },
      ]);

      for (const entry of suspiciousEmails) {
        log.warn(
          { tenantId, email: entry._id, count: entry.count },
          "Suspicious email pattern detected"
        );
        emitTicketEvent(tenantId, {
          event: "anomaly.suspicious_email",
          tenantId,
          email: entry._id,
          count: entry.count,
        });
        anomalyCount++;
      }
    }

    log.info(
      { tenantsChecked: tenants.length, anomaliesFound: anomalyCount },
      `[anomaly] Checked ${tenants.length} tenants, found ${anomalyCount} anomalies`
    );
  } catch (err) {
    log.error({ err }, "Anomaly worker tick failed");
  }
}

export function startAnomalyCron(intervalMs = 900000) {
  log.info({ intervalMs }, "Starting anomaly detection cron");
  processAnomalyDetection(); // run immediately
  timer = setInterval(processAnomalyDetection, intervalMs);
  timer.unref();
}

export function stopAnomalyCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info("Anomaly detection cron stopped");
  }
}

// Exported for tests and one-shot runs; mirrors billing.worker's runOnce(now).
export { processAnomalyDetection as runOnce };
