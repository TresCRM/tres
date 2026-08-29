import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let token: string;

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

  // Seed some data
  await Tenant.create({ slug: "tenant-a", branding: { name: "Tenant A" }, plan: "COMPANY", isActive: true });
  await Tenant.create({ slug: "tenant-b", branding: { name: "Tenant B" }, plan: "FREE", isActive: true });
});

afterAll(async () => {
  await testTeardown();
});

describe("Admin Analytics API", () => {
  test("GET /admin/analytics/overview — returns platform KPIs", async () => {
    const r = await request(app)
      .get("/api/v1/admin/analytics/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.tenants).toBeDefined();
    expect(r.body.data.tenants.total).toBeGreaterThanOrEqual(2);
    expect(r.body.data.users).toBeDefined();
    expect(r.body.data.tickets).toBeDefined();
    expect(r.body.data.customers).toBeDefined();
    expect(r.body.data.subscriptions).toBeDefined();
  });

  test("GET /admin/analytics/growth — returns 30d growth data", async () => {
    const r = await request(app)
      .get("/api/v1/admin/analytics/growth")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.newTenants).toBeInstanceOf(Array);
    expect(r.body.data.newUsers).toBeInstanceOf(Array);
    expect(r.body.data.newTickets).toBeInstanceOf(Array);
  });

  test("GET /admin/analytics/plans — returns plan distribution", async () => {
    const r = await request(app)
      .get("/api/v1/admin/analytics/plans")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data).toBeInstanceOf(Array);
  });
});
