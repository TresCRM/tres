import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let platformTenant: any;
let superAdminToken: string;
let managerToken: string;
let salesToken: string;
let customerCareToken: string;
let specialToken: string;
let regularToken: string;

async function createAdminUser(roles: Role[], email: string) {
  const user = await User.create({
    tenantId: platformTenant._id,
    firstName: "Test",
    lastName: roles[0],
    email,
    passwordHash: await hashPassword("Password123!"),
    roles,
    status: "ACTIVE",
    emailVerification: { token: "verified", expiresAt: new Date(), verifiedAt: new Date() },
  });
  return signAccessToken({
    sub: String(user._id),
    tid: String(platformTenant._id),
    roles,
  });
}

beforeAll(async () => {
  app = await testSetup();

  // Create __platform__ tenant
  platformTenant = await Tenant.create({
    slug: "__platform__",
    branding: { name: "Platform" },
    plan: "COMPANY",
    seats: 100,
    isActive: true,
  });

  // Create test admin users
  superAdminToken = await createAdminUser(["SUPER_ADMIN"], "super@test.local");
  managerToken = await createAdminUser(["MANAGER"], "manager@test.local");
  salesToken = await createAdminUser(["SALES"], "sales@test.local");
  customerCareToken = await createAdminUser(["CUSTOMER_CARE"], "cc@test.local");
  specialToken = await createAdminUser(["SPECIAL"], "special@test.local");

  // Create a regular (non-admin) user
  const regularUser = await User.create({
    tenantId: platformTenant._id,
    firstName: "Regular",
    lastName: "User",
    email: "regular@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["AGENT"] as Role[],
    status: "ACTIVE",
    emailVerification: { token: "verified", expiresAt: new Date(), verifiedAt: new Date() },
  });
  regularToken = signAccessToken({
    sub: String(regularUser._id),
    tid: String(platformTenant._id),
    roles: ["AGENT"] as Role[],
  });
});

afterAll(async () => {
  await testTeardown();
});

describe("Admin RBAC — Access Control", () => {
  test("non-admin users are rejected from all admin routes", async () => {
    await request(app)
      .get("/api/v1/admin/tenants")
      .set("Authorization", `Bearer ${regularToken}`)
      .expect(403);

    await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${regularToken}`)
      .expect(403);

    await request(app)
      .get("/api/v1/admin/analytics/overview")
      .set("Authorization", `Bearer ${regularToken}`)
      .expect(403);
  });

  test("unauthenticated requests are rejected", async () => {
    await request(app)
      .get("/api/v1/admin/tenants")
      .expect(401);
  });

  test("SUPER_ADMIN has access to all admin endpoints", async () => {
    const endpoints = [
      "/api/v1/admin/tenants",
      "/api/v1/admin/users",
      "/api/v1/admin/subscriptions",
      "/api/v1/admin/tickets",
      "/api/v1/admin/analytics/overview",
      "/api/v1/admin/content",
      "/api/v1/admin/audit",
      "/api/v1/admin/settings",
      "/api/v1/admin/announcements",
    ];

    for (const ep of endpoints) {
      const r = await request(app)
        .get(ep)
        .set("Authorization", `Bearer ${superAdminToken}`);
      expect(r.status).toBeLessThan(400);
    }
  });

  test("MANAGER can access tenants, users, subscriptions, tickets, analytics, audit", async () => {
    const allowed = [
      "/api/v1/admin/tenants",
      "/api/v1/admin/users",
      "/api/v1/admin/subscriptions",
      "/api/v1/admin/tickets",
      "/api/v1/admin/analytics/overview",
      "/api/v1/admin/audit",
    ];
    for (const ep of allowed) {
      const r = await request(app)
        .get(ep)
        .set("Authorization", `Bearer ${managerToken}`);
      expect(r.status).toBeLessThan(400);
    }
  });

  test("MANAGER cannot update platform settings", async () => {
    await request(app)
      .put("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ platformName: "Hacked" })
      .expect(403);
  });

  test("SALES can access tenant and subscription data but not content", async () => {
    await request(app)
      .get("/api/v1/admin/tenants")
      .set("Authorization", `Bearer ${salesToken}`)
      .expect(200);

    await request(app)
      .get("/api/v1/admin/subscriptions")
      .set("Authorization", `Bearer ${salesToken}`)
      .expect(200);

    // SALES cannot access content
    await request(app)
      .get("/api/v1/admin/content")
      .set("Authorization", `Bearer ${salesToken}`)
      .expect(403);
  });

  test("CUSTOMER_CARE can access tickets but not content or settings", async () => {
    await request(app)
      .get("/api/v1/admin/tickets")
      .set("Authorization", `Bearer ${customerCareToken}`)
      .expect(200);

    await request(app)
      .get("/api/v1/admin/content")
      .set("Authorization", `Bearer ${customerCareToken}`)
      .expect(403);

    await request(app)
      .get("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${customerCareToken}`)
      .expect(403);
  });

  test("SPECIAL can access content and announcements but not users or tenants updates", async () => {
    await request(app)
      .get("/api/v1/admin/content")
      .set("Authorization", `Bearer ${specialToken}`)
      .expect(200);

    await request(app)
      .get("/api/v1/admin/announcements")
      .set("Authorization", `Bearer ${specialToken}`)
      .expect(200);

    // SPECIAL cannot access users list (no ADMIN_USER_READ)
    await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${specialToken}`)
      .expect(403);
  });
});
