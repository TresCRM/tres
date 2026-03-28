import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Subscription } from "../../models/Subscription";
import { hashPassword } from "../../utils/auth";

let app:any, token:string, tenantId:string;

beforeAll(async () => {
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const u = await User.create({
    tenantId: t._id, firstName:"A", lastName:"B", email:"a@b.c",
    passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE"
  });
  token = jwt.sign({ sub:String(u._id), tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });

  const now = new Date();
  await Subscription.create({
    tenantId,
    planCode: "CO-20",
    status: "EXPIRED",
    seats: 20,
    entitlements: { sso:false, analytics:true },
    currentPeriodStart: new Date(now.getTime() - 40*86400000),
    currentPeriodEnd:   new Date(now.getTime() - 10*86400000),
    graceUntil:         new Date(now.getTime() - 3*86400000),
    lastPaymentStatus: "FAILED"
  });
});

afterAll(async () => { await testTeardown(); });

test("write is blocked when subscription is EXPIRED", async () => {
  const r = await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"A", body:"B" })
    .expect(402);
  expect(r.body.error).toBe("subscription_expired");
});
