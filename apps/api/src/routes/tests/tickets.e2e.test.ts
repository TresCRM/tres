import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
// import { Subscription } from "../../models/Subscription";
import jwt from "jsonwebtoken";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string, userId:string;
beforeAll(async () => {
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  const u = await User.create({
    tenantId: t._id, firstName:"A", lastName:"B", email:"a@b.c",
    passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE"
  });
  tenantId = String(t._id); userId = String(u._id);
  token = jwt.sign({ sub:userId, tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
  // allow write routes
  await seedActiveSubscription(tenantId);
});
afterAll(async () => { await testTeardown(); });

test("create ticket and close", async () => {
  const created = await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Help", body:"It broke" })
    .expect(201);
  const id = created.body.data._id;

  await request(app).post(`/api/v1/tickets/${id}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send({})
    .expect(200);
});
