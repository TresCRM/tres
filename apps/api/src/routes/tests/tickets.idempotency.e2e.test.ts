import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
// import { Subscription } from "../../models/Subscription";
import { seedActiveSubscription } from "../../tests/helpers";

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
  // await Subscription.create({
  //   tenantId: t._id,
  //   planCode: "CO-20",
  //   status: "ACTIVE",
  //   currentPeriodEnd: new Date(Date.now() + 30*24*3600*1000)
  // });
  await seedActiveSubscription(tenantId); 
});

afterAll(async () => { await testTeardown(); });

test("create is idempotent with same key", async () => {
  const key = "REQ-123";
  const r1 = await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", key)
    .send({
        subject: "Love",
        body: "I love you",
        priority: "HIGH",
        customerEmail: "iamcustomer@name.com",
        tags: "urgent",
        watchers: ["iamcustomer@name.com"],
      }).expect(201);
  const id = r1.body.data._id;

  const r2 = await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", key)
    .send({
        subject: "Love",
        body: "I love you",
        priority: "HIGH",
        customerEmail: "iamcustomer@name.com",
        tags: "urgent",
        watchers: ["iamcustomer@name.com"],
      })
    .expect(201);

  expect(r2.body.idempotent).toBeTruthy();
  expect(r2.body.data._id).toBe(id);
});
