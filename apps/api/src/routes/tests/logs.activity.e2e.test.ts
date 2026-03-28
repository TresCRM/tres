import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
// import { Subscription } from "../../models/Subscription";
import { hashPassword } from "../../utils/auth";
import { ActivityLog } from "../../models/ActivityLog";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string;

beforeAll(async () => {
  process.env.ACTIVITY_LOG_ENABLED = "1";
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
  await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Login broken", body:"help" })
    .expect(201);

  const rows = await ActivityLog.find({ tenantId }).lean();
  expect(rows.length).toBeGreaterThan(0);
  const latest = rows[rows.length - 1];
  expect(latest.method).toBe("POST");
  expect(String(latest.tenantId)).toBe(tenantId);
  expect(latest.route).toContain("/api/v1/tickets");
  expect(latest.status).toBe(201);
});