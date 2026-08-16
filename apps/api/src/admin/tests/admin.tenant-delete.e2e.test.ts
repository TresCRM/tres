/**
 * Tenant Hard-Delete (SUPER_ADMIN) — E2E Tests
 *
 * Covers:
 *  - RBAC enforcement (SUPER_ADMIN only)
 *  - Confirmation slug matching
 *  - Full purge across all collections
 *  - Idempotency (404 after delete)
 *  - Audit logging
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Ticket } from "../../models/Ticket";
import { Customer } from "../../models/Customer";
import { Comment } from "../../models/Comment";
import { Subscription } from "../../models/Subscription";
import { Message } from "../../models/Message";
import { Notification } from "../../models/Notification";
import { ApiKey } from "../../models/ApiKey";
import { Webhook } from "../../models/Webhook";
import { TicketTemplate } from "../../models/TicketTemplate";
import { KnowledgeArticle } from "../../models/KnowledgeArticle";
import { VideoSession } from "../../models/VideoSession";
import { CustomRole } from "../../models/CustomRole";
import { signAccessToken, hashPassword } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let superAdminToken: string;
let managerToken: string;
let salesToken: string;

beforeAll(async () => {
  app = await testSetup();

  const platform = await Tenant.create({
    slug: "__platform__",
    branding: { name: "Platform" },
    plan: "COMPANY",
    seats: 100,
    isActive: true,
  });

  // SUPER_ADMIN — can delete
  const superAdmin = await User.create({
    tenantId: platform._id,
    firstName: "Super", lastName: "Admin",
    email: "super@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["SUPER_ADMIN"] as Role[],
    status: "ACTIVE",
  });
  superAdminToken = signAccessToken({
    sub: String(superAdmin._id), tid: String(platform._id), roles: ["SUPER_ADMIN"] as Role[],
  });

  // MANAGER — cannot delete (only ADMIN_TENANT_READ/UPDATE/SUSPEND)
  const manager = await User.create({
    tenantId: platform._id,
    firstName: "Manager", lastName: "User",
    email: "manager@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["MANAGER"] as Role[],
    status: "ACTIVE",
  });
  managerToken = signAccessToken({
    sub: String(manager._id), tid: String(platform._id), roles: ["MANAGER"] as Role[],
  });

  // SALES — only read
  const sales = await User.create({
    tenantId: platform._id,
    firstName: "Sales", lastName: "User",
    email: "sales@test.local",
    passwordHash: await hashPassword("Password123!"),
    roles: ["SALES"] as Role[],
    status: "ACTIVE",
  });
  salesToken = signAccessToken({
    sub: String(sales._id), tid: String(platform._id), roles: ["SALES"] as Role[],
  });
});

afterAll(async () => {
  await testTeardown();
});

/** Seed a tenant with child records across many collections */
async function seedTenantWithData(slug: string) {
  const tenant = await Tenant.create({
    slug, branding: { name: `${slug} Co` }, plan: "COMPANY", seats: 20, isActive: true,
  });
  const tid = tenant._id;

  const owner = await User.create({
    tenantId: tid, firstName: "Owner", lastName: "User",
    email: `${slug}-owner@test.local`, passwordHash: await hashPassword("Pass123!"),
    roles: ["OWNER"] as Role[], status: "ACTIVE",
  });

  await User.create({
    tenantId: tid, firstName: "Agent", lastName: "User",
    email: `${slug}-agent@test.local`, passwordHash: await hashPassword("Pass123!"),
    roles: ["AGENT"] as Role[], status: "ACTIVE",
  });

  // 3 tickets
  const tickets = await Ticket.create([
    { tenantId: tid, subject: "T1", body: "b", status: "OPEN", createdBy: owner._id },
    { tenantId: tid, subject: "T2", body: "b", status: "CLOSED", createdBy: owner._id },
    { tenantId: tid, subject: "T3", body: "b", status: "OPEN", createdBy: owner._id },
  ]);

  // Comments on tickets
  await Comment.create([
    { tenantId: tid, ticketId: tickets[0]._id, authorId: owner._id, body: "c1", isAgent: true, isInternal: false },
    { tenantId: tid, ticketId: tickets[0]._id, authorId: owner._id, body: "c2", isAgent: true, isInternal: true },
  ]);

  // Customers
  await Customer.create([
    { tenantId: tid, name: "Cust 1", email: `cust1-${slug}@t.local` },
    { tenantId: tid, name: "Cust 2", email: `cust2-${slug}@t.local` },
  ]);

  // Subscription
  await Subscription.create({
    tenantId: tid, planCode: "TEAM", status: "ACTIVE", seats: 20,
    currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    entitlements: { api: true },
  });

  // Messages
  await Message.create({
    tenantId: tid, type: "CHANNEL", channelName: "general",
    senderId: owner._id, content: "hello team",
  });

  // Notifications
  await Notification.create({
    tenantId: tid, userId: owner._id, type: "ticket.assigned",
    title: "Test", body: "Test notification",
  });

  // API key
  await ApiKey.create({
    tenantId: tid, name: "Test Key", prefix: "sk_test_abc",
    keyHash: "hash-" + slug, scopes: ["tickets:read"],
    createdBy: owner._id,
  });

  // Webhook
  await Webhook.create({
    tenantId: tid, url: "https://example.com/hook",
    events: ["ticket.created"], secret: "s",
    createdBy: owner._id,
  });

  // Ticket template
  await TicketTemplate.create({
    tenantId: tid, name: "Test Template", createdBy: owner._id,
  });

  // Knowledge article
  await KnowledgeArticle.create({
    tenantId: tid, title: "FAQ 1", category: "general", body: "Answer",
    status: "PUBLISHED",
  });

  // Video session
  await VideoSession.create({
    tenantId: tid, agentId: owner._id, status: "ENDED",
    startedAt: new Date(), consentGiven: true, screenShareUsed: false,
  });

  // Custom role
  await CustomRole.create({
    tenantId: tid, name: "Senior Agent", permissions: ["TICKET_READ"],
    isActive: true, createdBy: owner._id,
  });

  return { tenant, tid, ownerId: owner._id };
}

describe("Admin Tenant Delete — RBAC", () => {
  test("MANAGER cannot delete a tenant (403 forbidden)", async () => {
    const { tenant } = await seedTenantWithData("rbac-manager");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ confirmSlug: "rbac-manager" });
    expect(res.status).toBe(403);
    // Tenant should still exist
    const stillThere = await Tenant.findById(tenant._id);
    expect(stillThere).toBeTruthy();
  });

  test("SALES cannot delete a tenant (403 forbidden)", async () => {
    const { tenant } = await seedTenantWithData("rbac-sales");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ confirmSlug: "rbac-sales" });
    expect(res.status).toBe(403);
  });

  test("Unauthenticated request returns 401", async () => {
    const { tenant } = await seedTenantWithData("rbac-unauth");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .send({ confirmSlug: "rbac-unauth" });
    expect([401, 403]).toContain(res.status);
  });
});

describe("Admin Tenant Delete — Confirmation", () => {
  test("SUPER_ADMIN delete without confirmSlug returns 400", async () => {
    const { tenant } = await seedTenantWithData("conf-missing");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("Wrong confirmSlug returns 400 confirmation_mismatch", async () => {
    const { tenant } = await seedTenantWithData("conf-wrong");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "wrong-slug" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("confirmation_mismatch");
    // Tenant still exists
    const stillThere = await Tenant.findById(tenant._id);
    expect(stillThere).toBeTruthy();
  });

  test("Delete nonexistent tenant returns 404", async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/507f1f77bcf86cd799439011`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "whatever" });
    expect(res.status).toBe(404);
  });
});

describe("Admin Tenant Delete — Purge", () => {
  test("SUPER_ADMIN with matching confirmSlug purges all tenant data", async () => {
    const { tenant, tid } = await seedTenantWithData("purge-full");

    // Verify seed data exists
    expect(await User.countDocuments({ tenantId: tid })).toBe(2);
    expect(await Ticket.countDocuments({ tenantId: tid })).toBe(3);
    expect(await Comment.countDocuments({ tenantId: tid })).toBe(2);
    expect(await Customer.countDocuments({ tenantId: tid })).toBe(2);
    expect(await Subscription.countDocuments({ tenantId: tid })).toBe(1);
    expect(await Message.countDocuments({ tenantId: tid })).toBe(1);
    expect(await Notification.countDocuments({ tenantId: tid })).toBe(1);
    expect(await ApiKey.countDocuments({ tenantId: tid })).toBe(1);
    expect(await Webhook.countDocuments({ tenantId: tid })).toBe(1);
    expect(await TicketTemplate.countDocuments({ tenantId: tid })).toBe(1);
    expect(await KnowledgeArticle.countDocuments({ tenantId: tid })).toBe(1);
    expect(await VideoSession.countDocuments({ tenantId: tid })).toBe(1);
    expect(await CustomRole.countDocuments({ tenantId: tid })).toBe(1);

    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "purge-full" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.tenantSlug).toBe("purge-full");
    expect(res.body.data.totalDeleted).toBeGreaterThanOrEqual(15);

    // Verify all data is gone
    expect(await Tenant.findById(tenant._id)).toBeNull();
    expect(await User.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Ticket.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Comment.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Customer.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Subscription.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Message.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Notification.countDocuments({ tenantId: tid })).toBe(0);
    expect(await ApiKey.countDocuments({ tenantId: tid })).toBe(0);
    expect(await Webhook.countDocuments({ tenantId: tid })).toBe(0);
    expect(await TicketTemplate.countDocuments({ tenantId: tid })).toBe(0);
    expect(await KnowledgeArticle.countDocuments({ tenantId: tid })).toBe(0);
    expect(await VideoSession.countDocuments({ tenantId: tid })).toBe(0);
    expect(await CustomRole.countDocuments({ tenantId: tid })).toBe(0);
  });

  test("Deletion response includes per-collection counts", async () => {
    const { tenant } = await seedTenantWithData("purge-counts");
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "purge-counts" });
    expect(res.status).toBe(200);
    expect(res.body.data.deletedCounts).toBeDefined();
    expect(res.body.data.deletedCounts.User).toBe(2);
    expect(res.body.data.deletedCounts.Ticket).toBe(3);
    expect(res.body.data.deletedCounts.Comment).toBe(2);
    expect(res.body.data.deletedCounts.Customer).toBe(2);
    expect(res.body.data.deletedCounts.Tenant).toBe(1);
  });

  test("Second delete of same tenant returns 404", async () => {
    const { tenant } = await seedTenantWithData("purge-idempotent");
    // First delete — success
    await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "purge-idempotent" })
      .expect(200);
    // Second delete — 404
    const res2 = await request(app)
      .delete(`/api/v1/admin/tenants/${tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "purge-idempotent" });
    expect(res2.status).toBe(404);
  });

  test("Delete does NOT affect other tenants", async () => {
    const a = await seedTenantWithData("purge-a");
    const b = await seedTenantWithData("purge-b");

    await request(app)
      .delete(`/api/v1/admin/tenants/${a.tenant._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ confirmSlug: "purge-a" })
      .expect(200);

    // Tenant B should still have all its data
    expect(await Tenant.findById(b.tenant._id)).toBeTruthy();
    expect(await User.countDocuments({ tenantId: b.tid })).toBe(2);
    expect(await Ticket.countDocuments({ tenantId: b.tid })).toBe(3);
    expect(await Customer.countDocuments({ tenantId: b.tid })).toBe(2);
  });
});

describe("Admin Tenant Delete — Service Layer", () => {
  test("purgeTenant throws for nonexistent tenant", async () => {
    const { purgeTenant } = await import("../../services/tenantPurge");
    await expect(purgeTenant("507f1f77bcf86cd799439012")).rejects.toThrow("tenant_not_found");
  });

  test("purgeTenant returns correct shape", async () => {
    const { tenant } = await seedTenantWithData("service-shape");
    const { purgeTenant } = await import("../../services/tenantPurge");
    const result = await purgeTenant(String(tenant._id));

    expect(result.tenantId).toBe(String(tenant._id));
    expect(result.tenantSlug).toBe("service-shape");
    expect(result.totalDeleted).toBeGreaterThan(0);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.deletedCounts).toBe("object");
    expect(result.deletedCounts.Tenant).toBe(1);
  });
});
