import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let token: string;
let contentId: string;

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
});

afterAll(async () => {
  await testTeardown();
});

describe("Admin Content API", () => {
  test("POST /admin/content — create content", async () => {
    const r = await request(app)
      .post("/api/v1/admin/content")
      .set("Authorization", `Bearer ${token}`)
      .send({
        slug: "privacy-policy",
        title: "Privacy Policy",
        body: "<p>We respect your privacy.</p>",
        type: "POLICY",
        status: "DRAFT",
      })
      .expect(201);

    expect(r.body.data.slug).toBe("privacy-policy");
    expect(r.body.data.title).toBe("Privacy Policy");
    contentId = r.body.data._id;
  });

  test("POST /admin/content — duplicate slug returns 409", async () => {
    await request(app)
      .post("/api/v1/admin/content")
      .set("Authorization", `Bearer ${token}`)
      .send({
        slug: "privacy-policy",
        title: "Duplicate",
        type: "POLICY",
      })
      .expect(409);
  });

  test("GET /admin/content — list content", async () => {
    const r = await request(app)
      .get("/api/v1/admin/content")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data).toBeInstanceOf(Array);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /admin/content/:id — get by ID", async () => {
    const r = await request(app)
      .get(`/api/v1/admin/content/${contentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.slug).toBe("privacy-policy");
  });

  test("GET /admin/content/:slug — get by slug", async () => {
    const r = await request(app)
      .get("/api/v1/admin/content/privacy-policy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(r.body.data.title).toBe("Privacy Policy");
  });

  test("PUT /admin/content/:id — update content", async () => {
    const r = await request(app)
      .put(`/api/v1/admin/content/${contentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "PUBLISHED", title: "Privacy Policy v2" })
      .expect(200);

    expect(r.body.data.status).toBe("PUBLISHED");
    expect(r.body.data.title).toBe("Privacy Policy v2");
    expect(r.body.data.publishedAt).toBeTruthy();
  });

  test("DELETE /admin/content/:id — delete content", async () => {
    await request(app)
      .delete(`/api/v1/admin/content/${contentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/admin/content/${contentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  test("POST /admin/content — validation error on bad slug", async () => {
    await request(app)
      .post("/api/v1/admin/content")
      .set("Authorization", `Bearer ${token}`)
      .send({
        slug: "Bad Slug!",
        title: "Test",
        type: "PAGE",
      })
      .expect(400);
  });
});
