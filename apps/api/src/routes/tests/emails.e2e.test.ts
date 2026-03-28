import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
// import { Subscription } from "../../models/Subscription";
import { EmailMessage } from "../../models/EmailMessage";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string;

beforeAll(async () => {
  process.env.EMAILS_DISABLED = "1";
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const u = await User.create({ tenantId: t._id, firstName:"A", lastName:"B", email:"mail@trescrm.local", passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE" });
  token = jwt.sign({ sub:String(u._id), tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
  await seedActiveSubscription(tenantId);
});

afterAll(async () => { await testTeardown(); });

test("create email template and send", async () => {
  await request(app).post("/api/v1/emails/templates")
    .set("Authorization", `Bearer ${token}`)
    .send({ key:"hello", name:"Hello", subject:"Hi {{name}}", html:"<b>Hello {{name}}</b>" })
    .expect(201);

  await request(app).post("/api/v1/emails/send")
    .set("Authorization", `Bearer ${token}`)
    .send({ to:"user@example.com", templateKey:"hello", vars:{ name:"Nick" }, messageKey:"k1" })
    .expect(201);

  const msgs = await EmailMessage.find({ tenantId }).lean();
  expect(msgs.length).toBeGreaterThan(0);
  expect(msgs[0].status).toBe("SKIPPED"); // because EMAILS_DISABLED=1
});
