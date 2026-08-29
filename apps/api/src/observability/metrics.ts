import type { Request, Response, NextFunction } from "express";

/* ------------------------------------------------------------------ */
/*  Lightweight Prometheus-compatible metrics (zero external deps)     */
/* ------------------------------------------------------------------ */

/** Simple counter — monotonically increasing value with optional labels. */
class Counter {
  private counts = new Map<string, number>();

  inc(labels: Record<string, string> = {}, amount = 1) {
    const key = labelKey(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
  }

  /** Yield all (labels, value) pairs. */
  entries(): [Record<string, string>, number][] {
    return [...this.counts.entries()].map(([k, v]) => [parseKey(k), v]);
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
    for (const [labels, value] of this.entries()) {
      lines.push(`${name}${formatLabels(labels)} ${value}`);
    }
    return lines.join("\n");
  }
}

/** Simple gauge — value that can go up and down. */
class Gauge {
  private values = new Map<string, number>();

  set(labels: Record<string, string> = {}, value: number) {
    this.values.set(labelKey(labels), value);
  }

  inc(labels: Record<string, string> = {}, amount = 1) {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + amount);
  }

  dec(labels: Record<string, string> = {}, amount = 1) {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - amount);
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
    for (const [k, v] of this.values.entries()) {
      lines.push(`${name}${formatLabels(parseKey(k))} ${v}`);
    }
    return lines.join("\n");
  }
}

/** Simple summary (sum + count, no quantile buckets for MVP). */
class Summary {
  private data = new Map<string, { sum: number; count: number }>();

  observe(labels: Record<string, string> = {}, value: number) {
    const key = labelKey(labels);
    const cur = this.data.get(key) ?? { sum: 0, count: 0 };
    cur.sum += value;
    cur.count += 1;
    this.data.set(key, cur);
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} summary`];
    for (const [k, { sum, count }] of this.data.entries()) {
      const lbls = formatLabels(parseKey(k));
      lines.push(`${name}_sum${lbls} ${sum}`);
      lines.push(`${name}_count${lbls} ${count}`);
    }
    return lines.join("\n");
  }
}

/* ---- label helpers ---- */

function labelKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}=${labels[k]}`).join(",");
}

function parseKey(key: string): Record<string, string> {
  if (!key) return {};
  const out: Record<string, string> = {};
  for (const pair of key.split(",")) {
    const [k, ...rest] = pair.split("=");
    out[k] = rest.join("=");
  }
  return out;
}

function formatLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return "";
  return (
    "{" +
    keys
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(",") +
    "}"
  );
}

/* ------------------------------------------------------------------ */
/*  Exported metrics singleton                                        */
/* ------------------------------------------------------------------ */

export const metrics = {
  httpRequestsTotal: new Counter(),
  httpRequestDuration: new Summary(),
  natsMessagesPublished: new Counter(),
  natsMessagesFailed: new Counter(),
  natsDeadLetterCount: new Counter(),
  emailsSent: new Counter(),
  emailsFailed: new Counter(),
  activeConnections: new Gauge(),
};

/* ------------------------------------------------------------------ */
/*  Express middleware                                                 */
/* ------------------------------------------------------------------ */

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - start) / 1_000_000; // ns -> ms

    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status: String(res.statusCode),
    };

    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDuration.observe(labels, durationMs);
  });

  next();
}

/* ------------------------------------------------------------------ */
/*  Prometheus text exposition                                        */
/* ------------------------------------------------------------------ */

export function getMetricsText(): string {
  const sections: string[] = [
    metrics.httpRequestsTotal.toPrometheus(
      "http_requests_total",
      "Total HTTP requests",
    ),
    metrics.httpRequestDuration.toPrometheus(
      "http_request_duration_ms",
      "HTTP request duration in milliseconds",
    ),
    metrics.natsMessagesPublished.toPrometheus(
      "nats_messages_published_total",
      "Total NATS messages published",
    ),
    metrics.natsMessagesFailed.toPrometheus(
      "nats_messages_failed_total",
      "Total NATS message handler failures",
    ),
    metrics.natsDeadLetterCount.toPrometheus(
      "nats_dead_letter_total",
      "Total NATS messages sent to dead-letter queue",
    ),
    metrics.emailsSent.toPrometheus("emails_sent_total", "Total emails sent"),
    metrics.emailsFailed.toPrometheus(
      "emails_failed_total",
      "Total email send failures",
    ),
    metrics.activeConnections.toPrometheus(
      "active_connections",
      "Current active WebSocket connections",
    ),
  ];

  return sections.join("\n\n") + "\n";
}
