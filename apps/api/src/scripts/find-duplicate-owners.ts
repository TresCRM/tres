/**
 * CLI: list existing OWNER-role users whose email is shared across multiple tenants.
 *
 * Run BEFORE the `unique_owner_email` partial index is built in production —
 * Mongo will refuse to create the unique index if duplicates already exist.
 *
 * Usage:
 *   npx ts-node apps/api/src/scripts/find-duplicate-owners.ts
 *
 * The script only READS. Resolve duplicates manually (delete/merge tenants)
 * before deploying the new schema.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { ENV } from "../config/env";
import { User } from "../models/User";
import { Tenant } from "../models/Tenant";

async function main() {
  await mongoose.connect(ENV.MONGO_URI);

  const dupes = await User.aggregate<{ _id: string; count: number; tenantIds: any[]; userIds: any[] }>([
    { $match: { roles: "OWNER" } },
    { $group: { _id: "$email", count: { $sum: 1 }, tenantIds: { $push: "$tenantId" }, userIds: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  if (dupes.length === 0) {
    console.log("✓ No duplicate OWNER emails. Safe to build the unique_owner_email index.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${dupes.length} email(s) owning multiple tenants:\n`);
  for (const d of dupes) {
    const tenants = await Tenant.find({ _id: { $in: d.tenantIds } }, { slug: 1, createdAt: 1, "branding.name": 1 }).lean();
    console.log(`  ${d._id}  (${d.count} tenants)`);
    for (const t of tenants) {
      console.log(`    - ${t.slug}  "${t.branding?.name ?? ""}"  created ${t.createdAt?.toISOString?.() ?? "?"}`);
    }
    console.log();
  }

  console.log("Resolve these before the unique index can be built.");
  await mongoose.disconnect();
  process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(2);
});
