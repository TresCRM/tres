/**
 * Stage 7: Growth Engine & Market Launch -- E2E Tests
 * Covers: industry packs, referrals, partners, widget tracking, CMS enhancements
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { IndustryPack } from "../../models/IndustryPack";
import { Referral } from "../../models/Referral";
import { WidgetImpression } from "../../models/WidgetImpression";
import { Content } from "../../models/Content";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: slug + " Co" }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: slug + "@test.local", passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  await seedActiveSubscription(String(tenant._id));
  return { tenant, user, token, tid: String(tenant._id), uid: String(user._id) };
}

/* ================================================================== */
/*  1. Industry Packs                                                  */
/* ================================================================== */
describe("Industry Packs (Stage 7.1)", () => {
  beforeAll(async () => {
    // Seed a test pack
    await IndustryPack.create({
      slug: "test-pack", name: "Test Pack", description: "For testing", icon: "🧪",
      issueTypes: [{ name: "Test Issue", description: "A test issue", defaultPriority: "MEDIUM" }],
      responseTemplates: [{ name: "Test Template", subject: "Test", body: "Hello", issueType: "test" }],
      slaTargets: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
      isActive: true, sortOrder: 1,
    });
  });

  test("list industry packs (public, no auth)", async () => {
    const res = await request(app).get("/api/v1/industry-packs");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("get single pack by slug", async () => {
    const res = await request(app).get("/api/v1/industry-packs/test-pack");
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Test Pack");
    expect(res.body.data.issueTypes.length).toBe(1);
  });

  test("apply pack to tenant", async () => {
    const s = await setup("pack-apply");
    const res = await request(app).post("/api/v1/industry-packs/test-pack/apply")
      .set("Authorization", "Bearer " + s.token);
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(true);
  });

  test("404 for nonexistent pack", async () => {
    const res = await request(app).get("/api/v1/industry-packs/nonexistent");
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  2. Referral Program                                                */
/* ================================================================== */
describe("Referral Program (Stage 7.4)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("referral-test");
    ownerToken = s.token;
  });

  test("generate referral code", async () => {
    const res = await request(app).post("/api/v1/referrals/generate")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(201);
    expect(res.body.data.referralCode).toMatch(/^REF-/);
    expect(res.body.data.expiresAt).toBeDefined();
  });

  test("list my referrals", async () => {
    const res = await request(app).get("/api/v1/referrals")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("get referral stats", async () => {
    const res = await request(app).get("/api/v1/referrals/stats")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.total).toBe("number");
  });
});

/* ================================================================== */
/*  3. Partner Program                                                 */
/* ================================================================== */
describe("Partner Program (Stage 7.7)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("partner-test");
    ownerToken = s.token;
  });

  test("apply for partner program", async () => {
    const res = await request(app).post("/api/v1/partners/apply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ companyName: "Partner Co", website: "https://partner.com", description: "We manage clients" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
  });

  test("get application status", async () => {
    const res = await request(app).get("/api/v1/partners/application")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.companyName).toBe("Partner Co");
  });
});

/* ================================================================== */
/*  4. Widget Growth Tracking                                          */
/* ================================================================== */
describe("Widget Growth Tracking (Stage 7.3)", () => {
  test("WidgetImpression model stores events", async () => {
    const s = await setup("widget-track");
    await WidgetImpression.create([
      { tenantId: s.tid, event: "impression", referrerDomain: "example.com", timestamp: new Date() },
      { tenantId: s.tid, event: "badge_click", timestamp: new Date() },
    ]);
    const count = await WidgetImpression.countDocuments({ tenantId: s.tid });
    expect(count).toBe(2);
  });
});

/* ================================================================== */
/*  5. CMS Enhancements                                                */
/* ================================================================== */
describe("CMS Enhancements (Stage 7.6)", () => {
  let authorId: string;
  beforeAll(async () => {
    const s = await setup("cms-test");
    authorId = s.uid;
  });

  test("Content model supports BLOG type", async () => {
    const content = await Content.create({
      type: "BLOG", slug: "test-blog-post", title: "First Blog Post",
      body: "This is our first blog post.", status: "DRAFT", authorId,
      meta: { title: "First Post - TRES CRM", description: "Our first blog post about CRM" },
    });
    expect(content.type).toBe("BLOG");
    expect(content.meta?.title).toBe("First Post - TRES CRM");
  });

  test("Content model supports CHANGELOG type", async () => {
    const content = await Content.create({
      type: "CHANGELOG", slug: "v2-release", title: "Version 2.0 Released",
      body: "New features in v2.0", status: "PUBLISHED", authorId,
      publishAt: new Date(),
    });
    expect(content.type).toBe("CHANGELOG");
    expect(content.publishAt).toBeDefined();
  });

  test("Content supports SEO meta", async () => {
    const content = await Content.create({
      type: "PAGE", slug: "seo-test-page", title: "SEO Test",
      body: "Content with SEO metadata", status: "PUBLISHED", authorId,
      meta: { title: "SEO Title", description: "SEO Description",
        ogImage: "https://example.com/og.png", canonicalUrl: "https://trescrm.com/seo-test", noIndex: false },
    });
    expect(content.meta?.ogImage).toBe("https://example.com/og.png");
    expect(content.meta?.canonicalUrl).toBe("https://trescrm.com/seo-test");
  });
});

/* ================================================================== */
/*  6. IndustryPack model                                              */
/* ================================================================== */
describe("IndustryPack model (Stage 7.1)", () => {
  test("supports all fields", async () => {
    const pack = await IndustryPack.create({
      slug: "model-test", name: "Model Test", description: "Testing", icon: "📦",
      issueTypes: [
        { name: "Issue A", description: "Desc A", defaultPriority: "HIGH" },
        { name: "Issue B", description: "Desc B", defaultPriority: "LOW" },
      ],
      responseTemplates: [{ name: "T1", subject: "S1", body: "B1", issueType: "test" }],
      slaTargets: { firstResponseMinutes: 60, resolutionMinutes: 480 },
      isActive: true, sortOrder: 0,
    });
    expect(pack.issueTypes.length).toBe(2);
    expect(pack.slaTargets.firstResponseMinutes).toBe(60);
  });
});

/* ================================================================== */
/*  7. Referral model                                                  */
/* ================================================================== */
describe("Referral model (Stage 7.4)", () => {
  test("supports all fields", async () => {
    const s = await setup("ref-model");
    const ref = await Referral.create({
      referrerId: s.uid, referrerTenantId: s.tid,
      referralCode: "REF-test123",
      status: "PENDING", rewardType: "free_month",
      referrerRewarded: false, referredRewarded: false,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    expect(ref.referralCode).toBe("REF-test123");
    expect(ref.status).toBe("PENDING");
  });
});
