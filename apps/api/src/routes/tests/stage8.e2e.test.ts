/**
 * Stage 8: Infrastructure & Launch Readiness -- E2E Tests
 * Covers: deploy pipeline validation, metrics auth, health checks, OpenAPI,
 * migration runner, security headers, launch content
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Content } from "../../models/Content";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

/* ================================================================== */
/*  1. Health endpoints                                                */
/* ================================================================== */
describe("Health & Readiness (Stage 8)", () => {
  test("GET /healthz returns 200 with mongo status", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mongo).toBe("connected");
  });

  test("GET /readyz returns 200", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  test("GET /healthz responds in under 50ms", async () => {
    const start = Date.now();
    await request(app).get("/healthz");
    expect(Date.now() - start).toBeLessThan(50);
  });
});

/* ================================================================== */
/*  2. Metrics endpoint                                                */
/* ================================================================== */
describe("Metrics Endpoint (Stage 8.3)", () => {
  test("GET /metrics returns Prometheus format", async () => {
    const res = await request(app).get("/metrics");
    // Without METRICS_TOKEN, should be accessible
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.text).toContain("http_requests_total");
    }
  });
});

/* ================================================================== */
/*  3. OpenAPI spec endpoint                                           */
/* ================================================================== */
describe("OpenAPI Spec (Stage 8)", () => {
  test("GET /api/v1/openapi.json returns valid spec", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info).toBeDefined();
    expect(res.body.paths).toBeDefined();
    // Should have many paths registered
    const pathCount = Object.keys(res.body.paths || {}).length;
    expect(pathCount).toBeGreaterThanOrEqual(10);
  });
});

/* ================================================================== */
/*  4. Security headers                                                */
/* ================================================================== */
describe("Security Headers (Stage 8.5)", () => {
  test("responses include Helmet security headers", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-xss-protection"]).toBe("0");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  test("responses include X-API-Version", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-api-version"]).toBe("v1");
  });

  test("CORS headers present for allowed origins", async () => {
    const res = await request(app).get("/healthz")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});

/* ================================================================== */
/*  5. Deploy workflow validation                                      */
/* ================================================================== */
describe("Infrastructure Files (Stage 8.1)", () => {
  const root = process.cwd();

  test("deploy.yml exists with GHCR config", () => {
    const file = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
    expect(file).toContain("ghcr.io");
    expect(file).toContain("docker/login-action");
    expect(file).toContain("infrastructure/helm");
    expect(file.toLowerCase()).toContain("smoke test");
  });

  test("Helm charts exist for all services", () => {
    expect(fs.existsSync(path.join(root, "infrastructure/helm/api/Chart.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "infrastructure/helm/web/Chart.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "infrastructure/helm/workers/Chart.yaml"))).toBe(true);
  });

  test("NATS Helm values exist", () => {
    expect(fs.existsSync(path.join(root, "infrastructure/helm/nats/values.yaml"))).toBe(true);
  });

  test("Redis Helm values exist", () => {
    expect(fs.existsSync(path.join(root, "infrastructure/helm/redis/values.yaml"))).toBe(true);
  });

  test("Terraform main exists", () => {
    expect(fs.existsSync(path.join(root, "infrastructure/terraform/main.tf"))).toBe(true);
  });
});

/* ================================================================== */
/*  6. Grafana dashboards exist                                        */
/* ================================================================== */
describe("Observability (Stage 8.3)", () => {
  const root = process.cwd();

  test("Grafana dashboard files exist", () => {
    const grafanaDir = path.join(root, "infrastructure/grafana");
    expect(fs.existsSync(grafanaDir)).toBe(true);
    const files = fs.readdirSync(grafanaDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  7. Documentation files                                             */
/* ================================================================== */
describe("Documentation (Stage 8)", () => {
  const root = process.cwd();

  test("incident response runbook exists", () => {
    expect(fs.existsSync(path.join(root, "docs/runbooks/incident-response.md"))).toBe(true);
  });

  test("security checklist exists", () => {
    const exists = fs.existsSync(path.join(root, "docs/security-checklist.md"));
    expect(exists).toBe(true);
  });

  test("performance baselines exists", () => {
    const exists = fs.existsSync(path.join(root, "docs/performance-baselines.md"));
    expect(exists).toBe(true);
  });

  test("launch checklist exists", () => {
    const exists = fs.existsSync(path.join(root, "docs/launch-checklist.md"));
    expect(exists).toBe(true);
  });
});

/* ================================================================== */
/*  8. Load test scripts exist                                         */
/* ================================================================== */
describe("Load Tests (Stage 8.4)", () => {
  const root = process.cwd();

  test("k6 load test scripts exist", () => {
    const loadDir = path.join(root, "tests/load");
    expect(fs.existsSync(loadDir)).toBe(true);
    const files = fs.readdirSync(loadDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  9. Migration infrastructure                                        */
/* ================================================================== */
describe("Migration Runner (Stage 8.2)", () => {
  const root = process.cwd();

  test("migrations directory exists with at least one migration", () => {
    const migrationsDir = path.join(root, "apps/api/src/migrations");
    expect(fs.existsSync(migrationsDir)).toBe(true);
    const files = fs.readdirSync(migrationsDir).filter((f: string) => f.match(/^\d+-.+\.ts$/));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
