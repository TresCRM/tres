import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
import { Subscription } from "../../models/Subscription";

let app:any, token:string, tenantId:string;

beforeAll(async () => {
  process.env.GRACE_DAYS = "7";
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const u = await User.create({
    tenantId: t._id, firstName:"Grace", lastName:"Case", email:"g@t.local",
    passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE"
  });
  token = jwt.sign({ sub:String(u._id), tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
    // 6 days left (within grace)
    //  status: { type: String, enum: ["ACTIVE","PAST_DUE","GRACE","EXPIRED","CANCELED"], default: "ACTIVE"},
  // await seedActiveSubscription(tenantId);

  const now = new Date();
  const past = new Date(now.getTime() - 86400000);            // period ended yesterday
  const graceEnd = new Date(now.getTime() + 6*86400000);      // 6 days left (within grace)
  await Subscription.create({
    tenantId: t._id,
    planCode: "CO-20",
    interval: "MONTH",
    seats: 20,
    status: "GRACE",
    currentPeriodStart: new Date(now.getTime() - 31*86400000),
    currentPeriodEnd: past,
    graceUntil: graceEnd,
    entitlements: { seats:20, api:true, realtime:true }
  });
  
});

afterAll(async () => { await testTeardown(); });

test("writes allowed during grace", async () => {
  await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Still allowed", body:"within grace" })
    .expect(201);
});

test("writes blocked after grace", async () => {
  // Move grace to past
  await Subscription.updateOne({ tenantId }, { $set: { graceUntil: new Date(Date.now() - 1000), status:"GRACE" }});
  await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Should fail", body:"grace ended" })
    .expect(402);
});
