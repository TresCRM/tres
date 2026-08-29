import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let token: string;
let testTenantId: string;

beforeAll(async () => {
  app = await testSetup();

  const platform = await Tenant.create({
    slug: "__platform__",
    branding: { name: "Platform" },
    plan: "COMPANY",
    seats: 100,
    isActive: true,
  });

  const user = await User.create({
    tenantId: platform._id,
    firstName: "Admin",
    lastName: "User",
    email: "admin@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["SUPER_ADMIN"] as Role[],
    status: "ACTIVE",
    emailVerification: { token: "verified", expiresAt: new Date(), verifiedAt: new Date() },
  });

  token = signAccessToken({
    sub: String(user._id),
    tid: String(platform._id),
    roles: ["SUPER_ADMIN"] as Role[],
  });

  // Create test tenants
  const t1 = await Tenant.create({ slug: "acme-corp", branding: { name: "Acme Corp" }, plan: "COMPANY", seats: 20, isActive: true });
  const t2 = await Tenant.create({ slug: "beta-inc", branding: { name: "Beta Inc" }, plan: "FREE", seats: 1, isActive: true });
  testTenantId = String(t1._id);
});

afterAll(async () => {
  await testTeardown();
});

describe("Admin Tenants API", () => {
  test("GET /admin/tenants — lists all tenants", async () => {
    const r = await request(app)
      .get("/api/v1/admin/tenants")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data).toBeInstanceOf(Array);
    expect(r.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test("GET /admin/tenants?q=acme — search by name", async () => {
    const r = await request(app)
      .get("/api/v1/admin/tenants?q=acme")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.some((t: any) => t.slug === "acme-corp")).toBe(true);
  });

  test("GET /admin/tenants?plan=FREE — filter by plan", async () => {
    const r = await request(app)
      .get("/api/v1/admin/tenants?plan=FREE")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    r.body.data.forEach((t: any) => expect(t.plan).toBe("FREE"));
  });

  test("GET /admin/tenants/:id — get single tenant with stats", async () => {
    const r = await request(app)
      .get(`/api/v1/admin/tenants/${testTenantId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.slug).toBe("acme-corp");
    expect(r.body.data.stats).toBeDefined();
    expect(r.body.data.stats.userCount).toBeDefined();
  });

  test("PUT /admin/tenants/:id — update tenant", async () => {
    const r = await request(app)
      .put(`/api/v1/admin/tenants/${testTenantId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seats: 50 })
      .expect(200);

    expect(r.body.data.seats).toBe(50);
  });

  test("POST /admin/tenants/:id/suspend — suspend tenant", async () => {
    const r = await request(app)
      .post(`/api/v1/admin/tenants/${testTenantId}/suspend`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.isActive).toBe(false);
  });

  test("POST /admin/tenants/:id/activate — activate tenant", async () => {
    const r = await request(app)
      .post(`/api/v1/admin/tenants/${testTenantId}/activate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.isActive).toBe(true);
  });

  test("GET /admin/tenants/:badid — 404 for non-existent", async () => {
    await request(app)
      .get("/api/v1/admin/tenants/000000000000000000000000")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
