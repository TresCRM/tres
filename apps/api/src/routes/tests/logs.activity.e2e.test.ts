import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
import { ActivityLog } from "../../models/ActivityLog";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string;

beforeAll(async () => {
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const u = await User.create({
    tenantId: t._id, firstName:"A", lastName:"B", email:"log@trescrm.local",
    passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE"
  });
  token = jwt.sign({ sub:String(u._id), tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
  await seedActiveSubscription(tenantId);
});

afterAll(async () => { await testTeardown(); });

test("activity log is written on ticket create", async () => {
  // Clear any existing logs for this tenant
  await ActivityLog.deleteMany({ tenantId });

  await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Login broken", body:"help" })
    .expect(201);

  // The ticket route handler calls logActivity() which writes to ActivityLog.
  // The audit middleware also writes if ACTIVITY_LOG_ENABLED=1 (may not be set in CI).
  // Poll for any activity log entry for this tenant.
  let latest: any = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    const rows = await ActivityLog.find({ tenantId }).sort({ _id: -1 }).lean();
    if (rows.length > 0) {
      latest = rows[0];
      break;
    }
  }

  expect(latest).not.toBeNull();
  expect(String(latest.tenantId)).toBe(tenantId);
  // Assert on fields that are reliably set by either the audit middleware or logActivity()
  expect(latest.method || latest.action).toBeTruthy();
});
