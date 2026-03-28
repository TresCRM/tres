import "dotenv/config";
import mongoose from "mongoose";
import { EmailTemplate } from "../models/EmailTemplate";

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  await mongoose.connect(uri);
  await EmailTemplate.updateOne(
    { tenantId: null, key: "survey.ticket_closed" },
    {
      tenantId: null,
      key: "survey.ticket_closed",
      name: "Survey after ticket closure",
      subject: "Quick feedback on your recent support with TRES CRM",
      html: `<div style="font-family:Arial,sans-serif">
        <p>Hi {{customer.email}},</p>
        <p>We'd love a quick rating on your recent support experience.</p>
        <p><a href="{{inviteUrl}}" style="background:#1a73e8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Take survey</a></p>
        <p>Thanks,<br/>TRES CRM Team</p>
      </div>`
    },
    { upsert: true }
  );
  console.log("Default survey email template seeded");
  await mongoose.disconnect();
}
run().catch(e=>{ console.error(e); process.exit(1); });
