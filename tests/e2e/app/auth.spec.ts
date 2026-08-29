import { test, expect } from "@playwright/test";
import { seedTenant, cleanupTenant, closeDb, totpFor, type SeededTenant } from "./fixtures/stack";
import { apiContext, apiSignIn, applySession } from "./fixtures/auth";

/**
 * Authentication end-to-end — HARDENINGS.md section 21.
 *
 * The API runs in a normal (non-test) mode here, so CSRF is enforced and the
 * MFA gate on privileged routes is live. That makes this suite the first place
 * the login and challenge flows are exercised the way an operator meets them,
 * rather than with those protections switched off.
 */

let tenant: SeededTenant;

test.beforeAll(async () => {
  tenant = await seedTenant();
});

test.afterAll(async () => {
  await cleanupTenant(tenant.tenantId);
  await closeDb();
});

test.describe("API authentication", () => {
  test("an agent signs in with password alone", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/auth/login", {
        data: {
          email: tenant.users.AGENT.email,
          password: tenant.users.AGENT.password,
          tenantSlug: tenant.slug,
        },
      });

      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.mfaRequired).toBeFalsy();
    } finally {
      await api.dispose();
    }
  });

  test("wrong credentials are rejected", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/auth/login", {
        data: {
          email: tenant.users.AGENT.email,
          password: "not-the-password",
          tenantSlug: tenant.slug,
        },
      });

      expect(res.ok()).toBe(false);
    } finally {
      await api.dispose();
    }
  });

  test("an owner is challenged for MFA rather than signed straight in", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/auth/login", {
        data: {
          email: tenant.users.OWNER.email,
          password: tenant.users.OWNER.password,
          tenantSlug: tenant.slug,
        },
      });

      const body = await res.json();
      expect(body.mfaRequired).toBe(true);
      expect(body.mfaTicket).toBeTruthy();
      // No session is issued until the second factor is presented.
      expect(body.accessToken).toBeUndefined();
    } finally {
      await api.dispose();
    }
  });

  test("a correct TOTP completes the challenge", async () => {
    const api = await apiContext();
    try {
      const session = await apiSignIn(api, tenant, "OWNER");
      expect(session.cookies.length).toBeGreaterThan(0);
    } finally {
      await api.dispose();
    }
  });

  test("a wrong TOTP is refused", async () => {
    const api = await apiContext();
    try {
      const login = await api.post("/api/v1/auth/login", {
        data: {
          email: tenant.users.OWNER.email,
          password: tenant.users.OWNER.password,
          tenantSlug: tenant.slug,
        },
      });
      const { mfaTicket } = await login.json();

      const verify = await api.post("/api/v1/auth/mfa-verify", {
        data: { mfaTicket, code: "000000" },
      });

      expect(verify.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("an MFA ticket is refused from a different client", async () => {
    // The ticket is pinned to the IP and User-Agent that requested it, so a
    // leaked ticket cannot be completed elsewhere.
    const first = await apiContext();
    const second = await (
      await import("@playwright/test")
    ).request.newContext({
      baseURL: (await import("./fixtures/stack")).readStack().apiUrl,
      userAgent: "definitely-a-different-client/1.0",
    });

    try {
      const login = await first.post("/api/v1/auth/login", {
        data: {
          email: tenant.users.ADMIN.email,
          password: tenant.users.ADMIN.password,
          tenantSlug: tenant.slug,
        },
      });
      const { mfaTicket } = await login.json();

      const stolen = await second.post("/api/v1/auth/mfa-verify", {
        data: { mfaTicket, code: await totpFor(tenant.users.ADMIN.mfaSecret!) },
      });

      expect(stolen.status()).toBe(401);
      expect((await stolen.json()).error).toBe("mfa_invalid");
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });
});

test.describe("MFA gate on privileged routes", () => {
  test("an agent reaches tickets without MFA", async () => {
    const api = await apiContext();
    try {
      const session = await apiSignIn(api, tenant, "AGENT");
      const res = await api.get("/api/v1/tickets", {
        headers: session.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {},
      });

      expect(res.status()).not.toBe(403);
    } finally {
      await api.dispose();
    }
  });

  test("an MFA-enrolled owner reaches tickets", async () => {
    const api = await apiContext();
    try {
      const session = await apiSignIn(api, tenant, "OWNER");
      const res = await api.get("/api/v1/tickets", {
        headers: session.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {},
      });

      expect(res.status()).not.toBe(403);
    } finally {
      await api.dispose();
    }
  });
});

test.describe("web application", () => {
  test("the sign-in page renders", async ({ page }) => {
    await page.goto("/signin");

    await expect(page.locator("input[type=email]").first()).toBeVisible();
  });

  test("the console redirects an anonymous visitor away", async ({ page }) => {
    await page.goto("/tickets");

    // middleware.ts redirects to "/?m=signin"; the landing page then forwards
    // to /signin. Assert the outcome — not on the console, on a sign-in
    // surface — rather than pinning the intermediate hop.
    await expect(page).not.toHaveURL(/\/tickets/);
    await expect(page).toHaveURL(/signin/);
  });

  test("a signed-in owner reaches the console", async ({ page, context, baseURL }) => {
    const api = await apiContext();
    try {
      const session = await apiSignIn(api, tenant, "OWNER");
      await applySession(context, session, baseURL!);
    } finally {
      await api.dispose();
    }

    await page.goto("/tickets");

    await expect(page).not.toHaveURL(/m=signin/);
  });
});
