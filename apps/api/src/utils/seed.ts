import { connectMongo } from "../db/mongoose";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { hashPassword } from "./auth";

async function run() {
  await connectMongo();
  const slug = "tres-crm";
  let tenant = await Tenant.findOne({ slug });
  if (!tenant) {
    tenant = await Tenant.create({
      slug,
      plan: "COMPANY",
      seats: 20,
      branding: {
        name: "TRES CRM",
        primaryColor: "#1a73e8",
        surfaceColor: "#f1f3f4",
        emailFrom: "no-reply@trescrm.local"
      }
    });
    console.log("Created tenant:", tenant.slug);
  }

  const email = "owner@trescrm.local";
  const exists = await User.findOne({ tenantId: tenant._id, email });
  if (!exists) {
    const passwordHash = await hashPassword("Password123!");
    await User.create({
      tenantId: tenant._id,
      firstName: "Owner",
      lastName: "User",
      email,
      passwordHash,
      roles: ["OWNER","ADMIN"],
      status: "ACTIVE"
    });
    console.log("Created owner user:", email, "(Password123!)");
  } else {
    console.log("Owner already exists:", email);
  }
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
