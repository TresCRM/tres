/**
 * @module tests/admin.bootstrap
 * Tests for the startup routine that provisions the __platform__ tenant and
 * its SUPER_ADMIN. It runs on every boot, so idempotency is the key property.
 */
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { ENV } from "../../config/env";
import { verifyPassword } from "../../utils/auth";
import { bootstrapAdmin } from "../../admin/bootstrap";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const SLUG = ENV.PLATFORM_TENANT_SLUG;
const savedEmail = ENV.ADMIN_EMAIL;
const savedPassword = ENV.ADMIN_PASSWORD;

afterEach(async () => {
  (ENV as any).ADMIN_EMAIL = savedEmail;
  (ENV as any).ADMIN_PASSWORD = savedPassword;
  await User.deleteMany({});
  await Tenant.deleteMany({});
});

describe("bootstrapAdmin — platform tenant", () => {
  test("creates the platform tenant on a fresh database", async () => {
    await bootstrapAdmin();

    const tenant = await Tenant.findOne({ slug: SLUG }).lean();
    expect(tenant).toBeTruthy();
    expect(tenant!.plan).toBe("COMPANY");
    expect(tenant!.seats).toBe(100);
    expect(tenant!.isActive).toBe(true);
    expect(tenant!.branding.name).toBe("TRES CRM Platform");
  });

  test("reuses an existing platform tenant instead of creating a second", async () => {
    await bootstrapAdmin();
    const first = await Tenant.findOne({ slug: SLUG }).lean();

    await bootstrapAdmin();

    expect(await Tenant.countDocuments({ slug: SLUG })).toBe(1);
    const second = await Tenant.findOne({ slug: SLUG }).lean();
    expect(String(second!._id)).toBe(String(first!._id));
  });

  test("leaves an existing tenant's fields untouched", async () => {
    await Tenant.create({
      slug: SLUG,
      branding: { name: "Renamed Platform" },
      plan: "COMPANY",
      seats: 7,
    });

    await bootstrapAdmin();

    const tenant = await Tenant.findOne({ slug: SLUG }).lean();
    expect(tenant!.branding.name).toBe("Renamed Platform");
    expect(tenant!.seats).toBe(7);
  });
});

describe("bootstrapAdmin — SUPER_ADMIN user", () => {
  test("creates the SUPER_ADMIN with the configured identity", async () => {
    await bootstrapAdmin();

    const user = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();
    expect(user).toBeTruthy();
    expect(user!.roles).toEqual(["SUPER_ADMIN"]);
    expect(user!.status).toBe("ACTIVE");
    expect(user!.firstName).toBe(ENV.ADMIN_FIRST_NAME);
    expect(user!.lastName).toBe(ENV.ADMIN_LAST_NAME);
  });

  test("attaches the admin to the platform tenant", async () => {
    await bootstrapAdmin();

    const tenant = await Tenant.findOne({ slug: SLUG }).lean();
    const user = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();
    expect(String(user!.tenantId)).toBe(String(tenant!._id));
  });

  test("stores a verifiable password hash rather than the password", async () => {
    await bootstrapAdmin();

    const user = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();
    expect(user!.passwordHash).not.toBe(ENV.ADMIN_PASSWORD);
    expect(await verifyPassword(ENV.ADMIN_PASSWORD, user!.passwordHash)).toBe(true);
  });

  test("marks the bootstrap admin as email-verified", async () => {
    await bootstrapAdmin();

    const user = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();
    expect(user!.emailVerification!.verifiedAt).toBeTruthy();
  });

  test("lowercases the configured admin email", async () => {
    (ENV as any).ADMIN_EMAIL = "Platform.Admin@Example.COM";

    await bootstrapAdmin();

    expect(await User.countDocuments({ email: "platform.admin@example.com" })).toBe(1);
  });

  test("does not create a second admin on a repeat run", async () => {
    await bootstrapAdmin();
    await bootstrapAdmin();

    expect(
      await User.countDocuments({ email: ENV.ADMIN_EMAIL.toLowerCase() })
    ).toBe(1);
  });

  test("does not overwrite an existing admin's password", async () => {
    await bootstrapAdmin();
    const before = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();

    await bootstrapAdmin();

    const after = await User.findOne({ email: ENV.ADMIN_EMAIL.toLowerCase() }).lean();
    expect(after!.passwordHash).toBe(before!.passwordHash);
  });
});

describe("bootstrapAdmin — incomplete configuration", () => {
  test("still provisions the tenant but seeds no admin without a password", async () => {
    (ENV as any).ADMIN_PASSWORD = "";

    await bootstrapAdmin();

    expect(await Tenant.countDocuments({ slug: SLUG })).toBe(1);
    expect(await User.countDocuments({})).toBe(0);
  });

  test("seeds no admin without an email", async () => {
    (ENV as any).ADMIN_EMAIL = "";

    await bootstrapAdmin();

    expect(await User.countDocuments({})).toBe(0);
  });
});
