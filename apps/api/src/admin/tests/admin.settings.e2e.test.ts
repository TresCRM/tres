import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let superToken: string;
let managerToken: string;

beforeAll(async () => {
  app = await testSetup();

  const platform = await Tenant.create({
    slug: "__platform__",
    branding: { name: "Platform" },
    plan: "COMPANY",
    seats: 100,
    isActive: true,
  });

  const superUser = await User.create({
    tenantId: platform._id,
    firstName: "Super",
    lastName: "Admin",
    email: "super@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["SUPER_ADMIN"] as Role[],
    status: "ACTIVE",
    emailVerification: { token: "verified", expiresAt: new Date(), verifiedAt: new Date() },
  });

  superToken = signAccessToken({
    sub: String(superUser._id),
    tid: String(platform._id),
    roles: ["SUPER_ADMIN"] as Role[],
  });

  const manager = await User.create({
    tenantId: platform._id,
    firstName: "Mgr",
    lastName: "User",
    email: "mgr@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["MANAGER"] as Role[],
    status: "ACTIVE",
    emailVerification: { token: "verified", expiresAt: new Date(), verifiedAt: new Date() },
  });

  managerToken = signAccessToken({
    sub: String(manager._id),
    tid: String(platform._id),
    roles: ["MANAGER"] as Role[],
  });
});

afterAll(async () => {
  await testTeardown();
});

describe("Admin Settings API", () => {
  test("GET /admin/settings — returns platform settings", async () => {
    const r = await request(app)
      .get("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);

    expect(r.body.data.key).toBe("global");
    expect(r.body.data.signupEnabled).toBeDefined();
    expect(r.body.data.maintenanceMode).toBeDefined();
  });

  test("PUT /admin/settings — SUPER_ADMIN can update", async () => {
    const r = await request(app)
      .put("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ platformName: "TRES CRM Pro", supportEmail: "help@tres.io" })
      .expect(200);

    expect(r.body.data.platformName).toBe("TRES CRM Pro");
    expect(r.body.data.supportEmail).toBe("help@tres.io");
  });

  test("PUT /admin/settings — MANAGER cannot update", async () => {
    await request(app)
      .put("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ platformName: "Hacked" })
      .expect(403);
  });

  test("PUT /admin/settings — invalid email returns 400", async () => {
    await request(app)
      .put("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ supportEmail: "not-an-email" })
      .expect(400);
  });

  test("GET /admin/settings — MANAGER can read", async () => {
    await request(app)
      .get("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
  });
});
