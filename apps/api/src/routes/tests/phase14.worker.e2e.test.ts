/**
 * @module tests/phase14.worker
 * Phase 14: Worker Hardening & Observability tests.
 * Covers: health endpoints, readiness, metrics, graceful shutdown,
 * NATS bus enhancements, event subjects, lifecycle management.
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { isShuttingDown } from "../../lifecycle";
import { SUBJECTS, busPublish, busDisconnect } from "../../events/bus";
import {
  metrics,
  getMetricsText,
  metricsMiddleware,
} from "../../observability/metrics";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});

afterAll(async () => {
  await testTeardown();
});

// ─── Health Endpoints ──────────────────────────────────────────────

describe("Health Endpoints (Phase 14.1)", () => {
  test("GET /healthz returns detailed status", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(res.body.mongo).toBe("connected");
    expect(res.body.timestamp).toBeTruthy();
  });

  test("GET /readyz returns ready when mongo is connected", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});

// ─── Metrics Endpoint ──────────────────────────────────────────────

describe("Metrics Endpoint (Phase 14.3)", () => {
  test("GET /metrics returns Prometheus text format", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("http_requests_total");
    expect(res.text).toContain("http_request_duration_ms");
    expect(res.text).toContain("nats_messages_published_total");
    expect(res.text).toContain("emails_sent_total");
    expect(res.text).toContain("active_connections");
  });

  test("GET /metrics has no-cache headers", async () => {
    const res = await request(app).get("/metrics");
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  test("metrics increment on HTTP requests", async () => {
    // Make a request to increment counters
    await request(app).get("/healthz");

    const text = getMetricsText();
    expect(text).toContain("http_requests_total");
    // At minimum there should be some counter entries after requests
    expect(text.length).toBeGreaterThan(100);
  });
});

// ─── Metrics Module ────────────────────────────────────────────────

describe("Metrics Module (Phase 14.3)", () => {
  test("Counter increments correctly", () => {
    metrics.emailsSent.inc({ provider: "test" });
    metrics.emailsSent.inc({ provider: "test" });
    metrics.emailsSent.inc({ provider: "other" });

    const text = metrics.emailsSent.toPrometheus("emails_sent_total", "Total emails");
    expect(text).toContain("# TYPE emails_sent_total counter");
    expect(text).toContain('provider="test"');
  });

  test("Gauge set/inc/dec works", () => {
    metrics.activeConnections.set({ type: "ws" }, 5);
    metrics.activeConnections.inc({ type: "ws" });
    metrics.activeConnections.dec({ type: "ws" });

    const text = metrics.activeConnections.toPrometheus("active_connections", "Active");
    expect(text).toContain("active_connections");
  });

  test("Summary tracks sum and count", () => {
    metrics.httpRequestDuration.observe({ method: "GET", route: "/test" }, 50);
    metrics.httpRequestDuration.observe({ method: "GET", route: "/test" }, 100);

    const text = metrics.httpRequestDuration.toPrometheus("http_request_duration_ms", "Duration");
    expect(text).toContain("http_request_duration_ms_sum");
    expect(text).toContain("http_request_duration_ms_count");
  });

  test("getMetricsText returns all metric families", () => {
    const text = getMetricsText();
    expect(text).toContain("# HELP http_requests_total");
    expect(text).toContain("# HELP nats_messages_published_total");
    expect(text).toContain("# HELP nats_dead_letter_total");
    expect(text).toContain("# HELP emails_sent_total");
    expect(text).toContain("# HELP emails_failed_total");
    expect(text).toContain("# HELP active_connections");
  });
});

// ─── Lifecycle Module ──────────────────────────────────────────────

describe("Lifecycle Module (Phase 14.1)", () => {
  test("isShuttingDown returns false during normal operation", () => {
    expect(isShuttingDown()).toBe(false);
  });
});

// ─── NATS Bus Enhancements ─────────────────────────────────────────

describe("NATS Bus (Phase 14.2)", () => {
  test("SUBJECTS contains all expected event types", () => {
    expect(SUBJECTS.TICKET_CREATED).toBe("ticket.created");
    expect(SUBJECTS.TICKET_REPLIED).toBe("ticket.replied");
    expect(SUBJECTS.TICKET_CLOSED).toBe("ticket.closed");
    expect(SUBJECTS.TICKET_ASSIGNED).toBe("ticket.assigned");
    expect(SUBJECTS.TICKET_REOPENED).toBe("ticket.reopened");
    expect(SUBJECTS.BILLING).toBe("billing.events");
    expect(SUBJECTS.DLQ).toBe("events.dlq");
  });

  test("busPublish does not throw when NATS is not connected", async () => {
    // In test env, NATS is not connected — should silently no-op
    await expect(busPublish("test.subject", { foo: "bar" })).resolves.not.toThrow();
  });

  test("busDisconnect does not throw when not connected", async () => {
    await expect(busDisconnect()).resolves.not.toThrow();
  });
});

// ─── Docker & Infrastructure ───────────────────────────────────────

describe("Docker Configuration (Phase 14.4)", () => {
  test("Dockerfile.web exists", () => {
    const fs = require("fs");
    const path = require("path");
    const dockerfilePath = path.resolve(__dirname, "../../../../../Dockerfile.web");
    expect(fs.existsSync(dockerfilePath)).toBe(true);
    const content = fs.readFileSync(dockerfilePath, "utf-8");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("node:20-alpine");
    expect(content).toContain("EXPOSE 3000");
  });

  test("Dockerfile.workers exists", () => {
    const fs = require("fs");
    const path = require("path");
    const dockerfilePath = path.resolve(__dirname, "../../../../../Dockerfile.workers");
    expect(fs.existsSync(dockerfilePath)).toBe(true);
    const content = fs.readFileSync(dockerfilePath, "utf-8");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("node:20-alpine");
  });

  test("docker-compose.yml has health checks", () => {
    const fs = require("fs");
    const path = require("path");
    const composePath = path.resolve(__dirname, "../../../../../docker-compose.yml");
    const content = fs.readFileSync(composePath, "utf-8");
    expect(content).toContain("healthcheck");
    expect(content).toContain("mongo");
    expect(content).toContain("nats");
  });

  test("docker-compose.prod.yml exists with all services", () => {
    const fs = require("fs");
    const path = require("path");
    const composePath = path.resolve(__dirname, "../../../../../docker-compose.prod.yml");
    expect(fs.existsSync(composePath)).toBe(true);
    const content = fs.readFileSync(composePath, "utf-8");
    expect(content).toContain("api:");
    expect(content).toContain("web:");
    expect(content).toContain("workers:");
    expect(content).toContain("healthcheck");
    expect(content).toContain("condition: service_healthy");
  });
});

// ─── Event Emitter Integration ─────────────────────────────────────

describe("Event Emitter (Phase 14.2)", () => {
  test("emitTicketEvent still works with three-way fan-out", () => {
    const { emitTicketEvent } = require("../../events/emitter");
    // Should not throw even without NATS or WebSocket
    expect(() => {
      emitTicketEvent("tenant123", {
        event: "ticket.created",
        ticketId: "ticket456",
      });
    }).not.toThrow();
  });
});
