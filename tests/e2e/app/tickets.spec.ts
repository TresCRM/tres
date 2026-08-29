import { test, expect, type APIRequestContext } from "@playwright/test";
import { seedTenant, cleanupTenant, closeDb, type SeededTenant } from "./fixtures/stack";
import { apiContext, apiSignIn } from "./fixtures/auth";

/**
 * Ticket lifecycle end-to-end — HARDENINGS.md section 21.
 *
 * Runs against the real API with CSRF and the MFA gate live, so these also
 * stand as a check that the permission matrix and the state machine agree with
 * each other in a running system rather than only in unit tests.
 */

let tenant: SeededTenant;

test.beforeAll(async () => {
  tenant = await seedTenant();
});

test.afterAll(async () => {
  await cleanupTenant(tenant.tenantId);
  await closeDb();
});

/** An API context already signed in as `role`, with the bearer token applied. */
async function asRole(role: "OWNER" | "ADMIN" | "AGENT" | "READONLY") {
  const api = await apiContext();
  const session = await apiSignIn(api, tenant, role);
  const auth = session.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};
  return { api, auth, dispose: () => api.dispose() };
}

async function createTicket(
  api: APIRequestContext,
  auth: Record<string, string>,
  overrides: Record<string, unknown> = {}
) {
  const res = await api.post("/api/v1/tickets", {
    headers: auth,
    data: {
      subject: "Printer is on fire",
      body: "It will not stop printing.",
      priority: "HIGH",
      ...overrides,
    },
  });
  if (res.status() !== 201) {
    throw new Error(`create failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data;
}

test.describe("creating tickets", () => {
  test("an agent creates a ticket", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth);

      expect(ticket._id).toBeTruthy();
      expect(ticket.subject).toBe("Printer is on fire");
      expect(ticket.status).toBe("OPEN");
      expect(ticket.priority).toBe("HIGH");
    } finally {
      await dispose();
    }
  });

  test("a too-short subject is rejected", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const res = await api.post("/api/v1/tickets", {
        headers: auth,
        data: { subject: "no", body: "body text" },
      });

      expect(res.status()).toBe(400);
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot create one", async () => {
    const { api, auth, dispose } = await asRole("READONLY");
    try {
      const res = await api.post("/api/v1/tickets", {
        headers: auth,
        data: { subject: "Should not work", body: "nope" },
      });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("an anonymous request is rejected", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/tickets", {
        data: { subject: "Should not work", body: "nope" },
      });

      expect([401, 403]).toContain(res.status());
    } finally {
      await api.dispose();
    }
  });
});

test.describe("listing and filtering", () => {
  test("a created ticket appears in the list", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Listed ticket one" });

      const res = await api.get("/api/v1/tickets", { headers: auth });
      const { data } = await res.json();

      expect(res.ok()).toBe(true);
      expect(data.map((t: any) => t._id)).toContain(ticket._id);
    } finally {
      await dispose();
    }
  });

  test("filtering by status narrows the result", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      await createTicket(api, auth, { subject: "Open for filtering" });

      const res = await api.get("/api/v1/tickets?status=OPEN", { headers: auth });
      const { data } = await res.json();

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((t: any) => t.status === "OPEN")).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("filtering by priority narrows the result", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      await createTicket(api, auth, { subject: "Critical one", priority: "CRITICAL" });

      const res = await api.get("/api/v1/tickets?priority=CRITICAL", { headers: auth });
      const { data } = await res.json();

      expect(data.every((t: any) => t.priority === "CRITICAL")).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("a read-only user can read", async () => {
    const { api, auth, dispose } = await asRole("READONLY");
    try {
      const res = await api.get("/api/v1/tickets", { headers: auth });

      expect(res.ok()).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("fetching one ticket returns it", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Fetch me by id" });

      const res = await api.get(`/api/v1/tickets/${ticket._id}`, { headers: auth });
      const { data } = await res.json();

      expect(data._id).toBe(ticket._id);
      expect(data.subject).toBe("Fetch me by id");
    } finally {
      await dispose();
    }
  });

  test("an unknown id is a 404", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const res = await api.get("/api/v1/tickets/64b7f0000000000000000000", {
        headers: auth,
      });

      expect(res.status()).toBe(404);
    } finally {
      await dispose();
    }
  });
});

test.describe("comments", () => {
  test("an agent adds a public reply", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Needs a reply" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/reply`, {
        headers: auth,
        data: { body: "We are looking into it.", isInternal: false },
      });

      expect(res.status()).toBe(201);
    } finally {
      await dispose();
    }
  });

  test("an agent adds an internal note", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Needs a note" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/reply`, {
        headers: auth,
        data: { body: "Customer is on the churn list.", isInternal: true },
      });

      expect(res.status()).toBe(201);
    } finally {
      await dispose();
    }
  });

  test("an empty reply is rejected", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Empty reply target" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/reply`, {
        headers: auth,
        data: { body: "" },
      });

      expect(res.status()).toBe(400);
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot comment", async () => {
    const author = await asRole("AGENT");
    const reader = await asRole("READONLY");
    try {
      const ticket = await createTicket(author.api, author.auth, {
        subject: "Read only cannot comment",
      });

      const res = await reader.api.post(`/api/v1/tickets/${ticket._id}/reply`, {
        headers: reader.auth,
        data: { body: "I should not be able to say this." },
      });

      expect(res.status()).toBe(403);
    } finally {
      await author.dispose();
      await reader.dispose();
    }
  });
});

test.describe("assignment", () => {
  test("an owner assigns a ticket to an agent", async () => {
    const owner = await asRole("OWNER");
    try {
      const ticket = await createTicket(owner.api, owner.auth, {
        subject: "Assign this one",
      });

      const users = await owner.api.get("/api/v1/users", { headers: owner.auth });
      const list = (await users.json()).data ?? [];
      const agent = list.find((u: any) => u.email === tenant.users.AGENT.email);
      expect(agent, "seeded agent should be listed").toBeTruthy();

      const res = await owner.api.post(`/api/v1/tickets/${ticket._id}/assign`, {
        headers: owner.auth,
        data: { assigneeId: agent._id },
      });

      expect(res.ok()).toBe(true);
    } finally {
      await owner.dispose();
    }
  });

  test("a read-only user cannot assign", async () => {
    const author = await asRole("AGENT");
    const reader = await asRole("READONLY");
    try {
      const ticket = await createTicket(author.api, author.auth, {
        subject: "Read only cannot assign",
      });

      const res = await reader.api.post(`/api/v1/tickets/${ticket._id}/assign`, {
        headers: reader.auth,
        data: { assigneeId: "64b7f0000000000000000000" },
      });

      expect(res.status()).toBe(403);
    } finally {
      await author.dispose();
      await reader.dispose();
    }
  });
});

test.describe("closing and reopening", () => {
  test("a ticket can be closed", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Close me" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/close`, {
        headers: auth,
        data: { reason: "resolved on the call" },
      });
      expect(res.ok()).toBe(true);

      const after = await api.get(`/api/v1/tickets/${ticket._id}`, { headers: auth });
      expect((await after.json()).data.status).toBe("CLOSED");
    } finally {
      await dispose();
    }
  });

  test("a closed ticket can be reopened", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Reopen me" });
      await api.post(`/api/v1/tickets/${ticket._id}/close`, {
        headers: auth,
        data: { reason: "closed too early" },
      });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/reopen`, {
        headers: auth,
        data: { reason: "customer replied" },
      });
      expect(res.ok()).toBe(true);

      const after = await api.get(`/api/v1/tickets/${ticket._id}`, { headers: auth });
      expect((await after.json()).data.status).toBe("REOPENED");
    } finally {
      await dispose();
    }
  });

  test("the state machine refuses an illegal transition", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      // OPEN cannot go straight to RESOLVED — it has to pass through work.
      const ticket = await createTicket(api, auth, { subject: "Illegal transition" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/status`, {
        headers: auth,
        data: { status: "RESOLVED" },
      });

      expect(res.ok()).toBe(false);
    } finally {
      await dispose();
    }
  });

  test("a legal transition is accepted", async () => {
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      const ticket = await createTicket(api, auth, { subject: "Legal transition" });

      const res = await api.post(`/api/v1/tickets/${ticket._id}/status`, {
        headers: auth,
        data: { status: "IN_PROGRESS" },
      });

      expect(res.ok()).toBe(true);
      const after = await api.get(`/api/v1/tickets/${ticket._id}`, { headers: auth });
      expect((await after.json()).data.status).toBe("IN_PROGRESS");
    } finally {
      await dispose();
    }
  });
});

test.describe("tenant isolation", () => {
  test("a ticket from another tenant is not reachable", async () => {
    const other = await seedTenant();
    const mine = await asRole("AGENT");
    const theirs = await apiContext();

    try {
      const theirSession = await apiSignIn(theirs, other, "AGENT");
      const theirAuth = theirSession.accessToken
        ? { Authorization: `Bearer ${theirSession.accessToken}` }
        : {};
      const theirTicket = await createTicket(theirs, theirAuth, {
        subject: "Belongs to the other tenant",
      });

      // Same id, different tenant's session — must not resolve.
      const res = await mine.api.get(`/api/v1/tickets/${theirTicket._id}`, {
        headers: mine.auth,
      });

      expect(res.status()).toBe(404);
    } finally {
      await mine.dispose();
      await theirs.dispose();
      await cleanupTenant(other.tenantId);
    }
  });
});
