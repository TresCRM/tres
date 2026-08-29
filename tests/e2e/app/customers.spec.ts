import { test, expect, type APIRequestContext } from "@playwright/test";
import { seedTenant, cleanupTenant, closeDb, type SeededTenant } from "./fixtures/stack";
import { apiContext, apiSignIn } from "./fixtures/auth";

/**
 * Customer CRUD and search end-to-end — HARDENINGS.md section 21.
 *
 * Customers hold the PII in this system, so alongside the CRUD paths these
 * check the boundaries that matter for that: the permission split between
 * roles, and that one tenant's records are invisible and unmodifiable from
 * another.
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

let seq = 0;
const uniqueEmail = () => `customer-${process.pid}-${++seq}@example.test`;

async function createCustomer(
  api: APIRequestContext,
  auth: Record<string, string>,
  overrides: Record<string, unknown> = {}
) {
  const res = await api.post("/api/v1/customers", {
    headers: auth,
    data: {
      name: "Ada Lovelace",
      email: uniqueEmail(),
      company: "Analytical Engines Ltd",
      phone: "+441234567890",
      ...overrides,
    },
  });
  if (res.status() !== 201) {
    throw new Error(`create failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data;
}

test.describe("creating customers", () => {
  test("an admin creates a customer", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const customer = await createCustomer(api, auth);

      expect(customer._id).toBeTruthy();
      expect(customer.name).toBe("Ada Lovelace");
      expect(customer.company).toBe("Analytical Engines Ltd");
    } finally {
      await dispose();
    }
  });

  test("a malformed email is rejected", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const res = await api.post("/api/v1/customers", {
        headers: auth,
        data: { name: "Bad Email", email: "not-an-address" },
      });

      expect(res.status()).toBe(400);
    } finally {
      await dispose();
    }
  });

  test("a missing name is rejected", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const res = await api.post("/api/v1/customers", {
        headers: auth,
        data: { email: uniqueEmail() },
      });

      expect(res.status()).toBe(400);
    } finally {
      await dispose();
    }
  });

  test("the same address cannot be added twice for one tenant", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const email = uniqueEmail();
      await createCustomer(api, auth, { email });

      const res = await api.post("/api/v1/customers", {
        headers: auth,
        data: { name: "Duplicate", email },
      });

      // A compound unique index covers { tenantId, email }.
      expect(res.ok()).toBe(false);
    } finally {
      await dispose();
    }
  });

  test("an agent can read customers but not create them", async () => {
    // AGENT holds CUSTOMER_READ only; creation belongs to OWNER/ADMIN. Worth
    // pinning, because "agent" reads as a write-capable role by its name.
    const { api, auth, dispose } = await asRole("AGENT");
    try {
      expect((await api.get("/api/v1/customers", { headers: auth })).ok()).toBe(true);

      const res = await api.post("/api/v1/customers", {
        headers: auth,
        data: { name: "Agent cannot", email: uniqueEmail() },
      });
      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot create one", async () => {
    const { api, auth, dispose } = await asRole("READONLY");
    try {
      const res = await api.post("/api/v1/customers", {
        headers: auth,
        data: { name: "Nope", email: uniqueEmail() },
      });

      expect(res.status()).toBe(403);
    } finally {
      await dispose();
    }
  });

  test("an anonymous request is rejected", async () => {
    const api = await apiContext();
    try {
      const res = await api.post("/api/v1/customers", {
        data: { name: "Nope", email: uniqueEmail() },
      });

      expect([401, 403]).toContain(res.status());
    } finally {
      await api.dispose();
    }
  });
});

test.describe("reading customers", () => {
  test("a created customer appears in the list", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const customer = await createCustomer(api, auth);

      const res = await api.get("/api/v1/customers", { headers: auth });
      const { data } = await res.json();

      expect(res.ok()).toBe(true);
      expect(data.map((c: any) => c._id)).toContain(customer._id);
    } finally {
      await dispose();
    }
  });

  test("fetching one customer returns it", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const customer = await createCustomer(api, auth, { name: "Grace Hopper" });

      const res = await api.get(`/api/v1/customers/${customer._id}`, { headers: auth });
      const { data } = await res.json();

      expect(data._id).toBe(customer._id);
      expect(data.name).toBe("Grace Hopper");
    } finally {
      await dispose();
    }
  });

  test("an unknown id is a 404", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const res = await api.get("/api/v1/customers/64b7f0000000000000000000", {
        headers: auth,
      });

      expect(res.status()).toBe(404);
    } finally {
      await dispose();
    }
  });

  test("a read-only user can read", async () => {
    const author = await asRole("ADMIN");
    const reader = await asRole("READONLY");
    try {
      await createCustomer(author.api, author.auth);

      const res = await reader.api.get("/api/v1/customers", { headers: reader.auth });

      expect(res.ok()).toBe(true);
    } finally {
      await author.dispose();
      await reader.dispose();
    }
  });

  test("the list honours a limit", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      await createCustomer(api, auth);
      await createCustomer(api, auth);

      const res = await api.get("/api/v1/customers?limit=1", { headers: auth });
      const { data } = await res.json();

      expect(data).toHaveLength(1);
    } finally {
      await dispose();
    }
  });
});

test.describe("search", () => {
  test("finds a customer by name", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      await createCustomer(api, auth, { name: "Zzyzx Findable" });

      const res = await api.get("/api/v1/customers?q=Zzyzx", { headers: auth });
      const { data } = await res.json();

      expect(data.some((c: any) => c.name === "Zzyzx Findable")).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("finds a customer by company", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      await createCustomer(api, auth, { company: "Qwertyuiop Holdings" });

      const res = await api.get("/api/v1/customers?q=Qwertyuiop", { headers: auth });
      const { data } = await res.json();

      expect(data.some((c: any) => c.company === "Qwertyuiop Holdings")).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("finds a customer by email", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const email = `searchable-${process.pid}-${++seq}@example.test`;
      await createCustomer(api, auth, { email });

      const res = await api.get(`/api/v1/customers?q=${encodeURIComponent(email)}`, {
        headers: auth,
      });
      const { data } = await res.json();

      expect(data.some((c: any) => c.email === email)).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("search is case-insensitive", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      await createCustomer(api, auth, { name: "Mixedcase Person" });

      const res = await api.get("/api/v1/customers?q=MIXEDCASE", { headers: auth });
      const { data } = await res.json();

      expect(data.some((c: any) => c.name === "Mixedcase Person")).toBe(true);
    } finally {
      await dispose();
    }
  });

  test("a regex metacharacter is treated as literal text", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      await createCustomer(api, auth, { name: "Regex Safe" });

      // Unescaped, ".*" would match everything; the query escapes it, so this
      // finds nothing rather than dumping the whole customer list.
      const res = await api.get("/api/v1/customers?q=.*", { headers: auth });
      const { data } = await res.json();

      expect(res.ok()).toBe(true);
      expect(data.some((c: any) => c.name === "Regex Safe")).toBe(false);
    } finally {
      await dispose();
    }
  });

  test("a query matching nothing returns an empty list", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const res = await api.get("/api/v1/customers?q=nosuchcustomeranywhere", {
        headers: auth,
      });
      const { data } = await res.json();

      expect(data).toEqual([]);
    } finally {
      await dispose();
    }
  });
});

test.describe("updating and deleting", () => {
  test("an agent updates a customer", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const customer = await createCustomer(api, auth);

      const res = await api.put(`/api/v1/customers/${customer._id}`, {
        headers: auth,
        data: { name: "Ada King", company: "Renamed Ltd" },
      });
      expect(res.ok()).toBe(true);

      const after = await api.get(`/api/v1/customers/${customer._id}`, { headers: auth });
      const { data } = await after.json();
      expect(data.name).toBe("Ada King");
      expect(data.company).toBe("Renamed Ltd");
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot update", async () => {
    const author = await asRole("ADMIN");
    const reader = await asRole("READONLY");
    try {
      const customer = await createCustomer(author.api, author.auth);

      const res = await reader.api.put(`/api/v1/customers/${customer._id}`, {
        headers: reader.auth,
        data: { name: "Should not stick" },
      });

      expect(res.status()).toBe(403);
    } finally {
      await author.dispose();
      await reader.dispose();
    }
  });

  test("an agent deletes a customer", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const customer = await createCustomer(api, auth);

      const res = await api.delete(`/api/v1/customers/${customer._id}`, { headers: auth });
      expect(res.ok()).toBe(true);

      const after = await api.get(`/api/v1/customers/${customer._id}`, { headers: auth });
      expect(after.status()).toBe(404);
    } finally {
      await dispose();
    }
  });

  test("deleting an unknown customer is a 404", async () => {
    const { api, auth, dispose } = await asRole("ADMIN");
    try {
      const res = await api.delete("/api/v1/customers/64b7f0000000000000000000", {
        headers: auth,
      });

      expect(res.status()).toBe(404);
    } finally {
      await dispose();
    }
  });

  test("a read-only user cannot delete", async () => {
    const author = await asRole("ADMIN");
    const reader = await asRole("READONLY");
    try {
      const customer = await createCustomer(author.api, author.auth);

      const res = await reader.api.delete(`/api/v1/customers/${customer._id}`, {
        headers: reader.auth,
      });

      expect(res.status()).toBe(403);
    } finally {
      await author.dispose();
      await reader.dispose();
    }
  });
});

test.describe("tenant isolation", () => {
  test("another tenant's customer is neither readable nor deletable", async () => {
    const other = await seedTenant();
    const mine = await asRole("ADMIN");
    const theirs = await apiContext();

    try {
      const theirSession = await apiSignIn(theirs, other, "ADMIN");
      const theirAuth = theirSession.accessToken
        ? { Authorization: `Bearer ${theirSession.accessToken}` }
        : {};
      const theirCustomer = await createCustomer(theirs, theirAuth, {
        name: "Belongs Elsewhere",
      });

      const read = await mine.api.get(`/api/v1/customers/${theirCustomer._id}`, {
        headers: mine.auth,
      });
      const remove = await mine.api.delete(`/api/v1/customers/${theirCustomer._id}`, {
        headers: mine.auth,
      });

      expect(read.status()).toBe(404);
      expect(remove.status()).toBe(404);

      // And it is still there for its owner.
      const stillThere = await theirs.get(`/api/v1/customers/${theirCustomer._id}`, {
        headers: theirAuth,
      });
      expect(stillThere.ok()).toBe(true);
    } finally {
      await mine.dispose();
      await theirs.dispose();
      await cleanupTenant(other.tenantId);
    }
  });

  test("another tenant's customer does not appear in search", async () => {
    const other = await seedTenant();
    const mine = await asRole("ADMIN");
    const theirs = await apiContext();

    try {
      const theirSession = await apiSignIn(theirs, other, "ADMIN");
      const theirAuth = theirSession.accessToken
        ? { Authorization: `Bearer ${theirSession.accessToken}` }
        : {};
      await createCustomer(theirs, theirAuth, { name: "Hidden Crossboundary" });

      const res = await mine.api.get("/api/v1/customers?q=Crossboundary", {
        headers: mine.auth,
      });
      const { data } = await res.json();

      expect(data).toEqual([]);
    } finally {
      await mine.dispose();
      await theirs.dispose();
      await cleanupTenant(other.tenantId);
    }
  });
});
