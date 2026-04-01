/**
 * @module admin/bootstrap
 * Auto-creates the __platform__ tenant and SUPER_ADMIN user on startup.
 * Idempotent — safe to run on every boot.
 */
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { ENV } from "../config/env";
import { hashPassword } from "../utils/auth";
import type { Role } from "../../../../packages/types/src/roles";
import pino from "pino";

const log = pino({ name: "admin-bootstrap" });

export async function bootstrapAdmin(): Promise<void> {
  const slug = ENV.PLATFORM_TENANT_SLUG;

  // 1. Ensure __platform__ tenant exists
  let tenant = await Tenant.findOne({ slug });
  if (!tenant) {
    tenant = await Tenant.create({
      slug,
      branding: { name: "TRES CRM Platform" },
      plan: "COMPANY",
      seats: 100,
      isActive: true,
    });
    log.info("Created __platform__ tenant");
  }

  // 2. Ensure SUPER_ADMIN user exists
  if (!ENV.ADMIN_EMAIL || !ENV.ADMIN_PASSWORD) {
    log.warn("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }

  const existing = await User.findOne({
    tenantId: tenant._id,
    email: ENV.ADMIN_EMAIL.toLowerCase(),
  });

  if (!existing) {
    const roles: Role[] = ["SUPER_ADMIN"];
    await User.create({
      tenantId: tenant._id,
      firstName: ENV.ADMIN_FIRST_NAME,
      lastName: ENV.ADMIN_LAST_NAME,
      email: ENV.ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(ENV.ADMIN_PASSWORD),
      roles,
      status: "ACTIVE",
      emailVerification: { token: "bootstrap", expiresAt: new Date(), verifiedAt: new Date() },
    });
    log.info({ email: ENV.ADMIN_EMAIL }, "Created SUPER_ADMIN user");
  }
}
