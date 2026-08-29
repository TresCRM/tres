import { test, expect } from "@playwright/test";
import { seedTenant, cleanupTenant, closeDb, type SeededTenant } from "./fixtures/stack";
import { apiContext, apiSignIn } from "./fixtures/auth";

/**
 * Billing end-to-end — HARDENINGS.md section 21.
 *
 * Checkout talks to Paystack, so the harness runs a stub of it and points the
 * API there through PAYSTACK_BASE_URL. That makes the upgrade path testable
 * without the live service: previously the only two options were a 503 (no
 * provider configured) or real traffic to api.paystack.co.
 */

let tenant: SeededTenant;

test.beforeAll(async () => {
  tenant = await seedTenant();
});

test.afterAll(async () => {
  await cleanupTenant(tenant.tenantId);
  await closeDb();
});

async function asRole(role: "OWNER" | "ADMIN" | "AGENT" | "READONLY") {
  const api = await apiContext();
  const session = await apiSignIn(api, tenant, role);
  const auth = session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};
  return { api, auth, dispose: () => api.dispose() };
}

test.describe("plan catalogue", () => {
  test("the plans list is publicly readable", async () => {
    const api = await apiContext();
    try {
      const res = await api.get("/api/v1/subscriptions/plans");
      const body = await res.json();

      expect(res.ok()).toBe(true);
      expect(Array.isArray(body.data ?? body.plans ?? body)).toBe(true);
    } finally {
      await api.dispose();
    }
  });

  test("the catalogue includes the seeded plan code", async () => {
    const api = await apiContext();
    try {
      const res = await api.get("/api/v1/subscriptions/plans");
      const body = await res.json();
      const plans = body.data ?? body.plans ?? body;

      expect(JSON.stringify(plans)).toContain("TEAM");
    } finally {
      await api.dispose();
    }
  });
});

test.describe("current subscription", () => {
  test("an owner sees the tenant's active subscription", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.get("/api/v1/subscriptions/me", { headers: auth });
      const { data } = await res.json();

      expect(res.ok()).toBe(true);
      expect(data.status).toBe("ACTIVE");
      expect(data.planCode).toBe("CO-20");
      expect(new Date(data.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
    } finally {
      await dispose();
    }
  });

  test("an anonymous caller cannot read it", async () => {
    const api = await apiContext();
    try {
      const res = await api.get("/api/v1/subscriptions/me");

      expect([401, 403]).toContain(res.status());
    } finally {
      await api.dispose();
    }
  });

  test("a tenant only ever sees its own", async () => {
    const other = await seedTenant();
    const mine = await asRole("OWNER");
    try {
      const res = await mine.api.get("/api/v1/subscriptions/me", { headers: mine.auth });
      const { data } = await res.json();

      expect(String(data.tenantId)).toBe(tenant.tenantId);
      expect(String(data.tenantId)).not.toBe(other.tenantId);
    } finally {
      await mine.dispose();
      await cleanupTenant(other.tenantId);
    }
  });
});

test.describe("checkout", () => {
  test("an owner starts an upgrade and gets a redirect target", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: {
          planCode: "TEAM",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });
      const body = await res.json();

      expect(res.ok()).toBe(true);
      const payload = body.data ?? body;
      expect(payload.authorizationUrl ?? payload.authorization_url).toContain(
        "checkout.paystack.test"
      );
      expect(payload.reference).toBeTruthy();
    } finally {
      await dispose();
    }
  });

  test("an unknown plan is rejected", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: {
          planCode: "NO-SUCH-PLAN",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });

      expect(res.ok()).toBe(false);
    } finally {
      await dispose();
    }
  });

  test("an agent cannot start a checkout", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: {
          planCode: "TEAM",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot start a checkout", async () => {
    const { api, auth, dispose } = await asRole("READONLY");
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: {
          planCode: "TEAM",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("an anonymous caller cannot start a checkout", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        data: {
          planCode: "TEAM",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });

      expect([401, 403]).toContain(res.status());
    } finally {
      await api.dispose();
    }
  });

  test("an invalid checkout body is answered with JSON, not an HTML page", async () => {
    // The body schema is parsed outside the handler's try/catch, so a bad
    // request escapes as an unhandled error. An API client gets whatever the
    // framework renders — which must still be JSON.
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: { planCode: "TEAM" }, // missing email and callbackUrl
      });

      expect(res.ok()).toBe(false);
      expect(res.headers()["content-type"] ?? "").toContain("application/json");
    } finally {
      await dispose();
    }
  });
});

test.describe("verifying a payment", () => {
  test("a successful transaction is accepted", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const checkout = await api.post("/api/v1/subscriptions/checkout", {
        headers: auth,
        data: {
          planCode: "TEAM",
          interval: "MONTH",
          email: "billing@e2e.test",
          callbackUrl: "http://127.0.0.1:3100/billing/callback",
        },
      });
      const payload = (await checkout.json()).data ?? {};

      const res = await api.post("/api/v1/subscriptions/verify", {
        headers: auth,
        data: { reference: payload.reference ?? "e2e_ref_1" },
      });

      // The stub reports the transaction as successful.
      expect(res.ok()).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("verify requires a reference", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.post("/api/v1/subscriptions/verify", {
        headers: auth,
        data: {},
      });

      expect(res.ok()).toBe(false);
    } finally {
      await dispose();
    }
  });

  test("an agent cannot verify a payment", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const res = await api.post("/api/v1/subscriptions/verify", {
        headers: auth,
        data: { reference: "e2e_ref_1" },
      });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });
});

test.describe("invoices", () => {
  test("an owner can list invoices", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.get("/api/v1/invoices", { headers: auth });

      expect(res.ok()).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("an agent cannot list invoices", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const res = await api.get("/api/v1/invoices", { headers: auth });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("an unknown invoice is a 404", async () => {
    const { api, auth, dispose } = await asRole("OWNER");
    try {
      const res = await api.get("/api/v1/invoices/64b7f0000000000000000000", {
        headers: auth,
      });

      expect(res.status()).toBe(404);
    } finally {
      await dispose();
    }
  });
});
