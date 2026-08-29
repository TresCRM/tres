import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { Tenant } from "../../../../apps/api/src/models/Tenant";
import { User } from "../../../../apps/api/src/models/User";
import { Ticket } from "../../../../apps/api/src/models/Ticket";
import { Customer } from "../../../../apps/api/src/models/Customer";
import { hashPassword } from "../../../../apps/api/src/utils/auth";
import { generateSecret, generateTOTP } from "../../../../apps/api/src/utils/totp";

/**
 * Seeding and sign-in helpers for the app end-to-end suite.
 *
 * Tenants and users are created directly in the database rather than through
 * the HTTP API. Signup leaves a user PENDING and mails a verification token
 * which, with email delivery switched off, is never observable — so there is no
 * way to activate an account over HTTP alone. Seeding also lets a test enrol a
 * user in MFA with a secret it knows, which is what makes the login challenge
 * testable at all.
 *
 * Everything a test creates is namespaced by a per-worker suffix so the three
 * browser projects and Playwright's workers cannot collide on tenant slugs or
 * the one-tenant-per-owner-email rule.
 */

const STACK_FILE = path.resolve(__dirname, ".stack.json");

export interface StackInfo {
  mongoUri: string;
  apiUrl: string;
}

export function readStack(): StackInfo {
  if (!fs.existsSync(STACK_FILE)) {
    throw new Error(
      `E2E stack file missing at ${STACK_FILE} — the API webServer publishes it on boot.`
    );
  }
  return JSON.parse(fs.readFileSync(STACK_FILE, "utf8"));
}

let connected: Promise<typeof mongoose> | null = null;

/** Connect once per worker process. */
export async function db(): Promise<typeof mongoose> {
  if (!connected) {
    connected = mongoose.connect(readStack().mongoUri, { dbName: "test" });
  }
  return connected;
}

export async function closeDb(): Promise<void> {
  if (connected) {
    await (await connected).disconnect().catch(() => {});
    connected = null;
  }
}

export type SeedRole = "OWNER" | "ADMIN" | "AGENT" | "READONLY";

export interface SeededUser {
  email: string;
  password: string;
  role: SeedRole;
  /** Present only for roles enrolled in MFA. */
  mfaSecret?: string;
}

export interface SeededTenant {
  slug: string;
  tenantId: string;
  users: Record<SeedRole, SeededUser>;
}

export const PASSWORD = "E2ePassw0rd!";

/**
 * OWNER and ADMIN are enrolled in MFA because requireMfaForPrivileged blocks
 * those roles from tickets, customers, users and settings until they are. That
 * is the product's rule, so the fixture follows it rather than working around
 * it by running the API in test mode.
 */
const MFA_ROLES: SeedRole[] = ["OWNER", "ADMIN"];

let seq = 0;
function unique(prefix: string): string {
  return `${prefix}-${process.pid.toString(36)}-${(++seq).toString(36)}-${Date.now().toString(36)}`;
}

export async function seedTenant(): Promise<SeededTenant> {
  await db();

  const slug = unique("e2e");
  const tenant = await Tenant.create({
    slug,
    branding: { name: `E2E ${slug}` },
    plan: "COMPANY",
    seats: 10,
    isActive: true,
  });

  const passwordHash = await hashPassword(PASSWORD);
  const users = {} as Record<SeedRole, SeededUser>;

  for (const role of ["OWNER", "ADMIN", "AGENT", "READONLY"] as SeedRole[]) {
    const email = `${role.toLowerCase()}.${slug}@e2e.test`;
    const mfaSecret = MFA_ROLES.includes(role) ? generateSecret() : undefined;

    await User.create({
      tenantId: tenant._id,
      firstName: role[0] + role.slice(1).toLowerCase(),
      lastName: "User",
      email,
      passwordHash,
      roles: [role],
      status: "ACTIVE",
      emailVerification: { token: "seeded", expiresAt: new Date(), verifiedAt: new Date() },
      ...(mfaSecret
        ? { mfa: { secret: mfaSecret, enabled: true, recoveryCodes: [] } }
        : {}),
    });

    users[role] = { email, password: PASSWORD, role, mfaSecret };
  }

  return { slug, tenantId: String(tenant._id), users };
}

/** Remove everything a seeded tenant owns. */
export async function cleanupTenant(tenantId: string): Promise<void> {
  await db();

  await Promise.all([
    Ticket.deleteMany({ tenantId }),
    Customer.deleteMany({ tenantId }),
    User.deleteMany({ tenantId }),
    Tenant.deleteOne({ _id: tenantId }),
  ]);
}

/** A TOTP code valid right now for a seeded secret. */
export function totpFor(secret: string): string {
  return generateTOTP(secret);
}
