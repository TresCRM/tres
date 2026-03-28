import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { hashPassword } from "../../utils/auth";
// import { Subscription } from "../../models/Subscription";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string, surveyId:string;

beforeAll(async () => {
  process.env.EMAILS_DISABLED = "1";
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const u = await User.create({ tenantId: t._id, firstName:"A", lastName:"B", email:"survey@trescrm.local", passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE" });
  token = jwt.sign({ sub:String(u._id), tid:tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
  await seedActiveSubscription(tenantId);
});

afterAll(async () => { await testTeardown(); });

test("create survey and send invite then submit", async () => {
  const created = await request(app).post("/api/v1/surveys")
    .set("Authorization", `Bearer ${token}`)
    .send({ key:"ticket_closure_csat", name:"CSAT", questions:[{ key:"satisfaction", label:"How satisfied?", type:"RATING" }] })
    .expect(201);
  surveyId = created.body.data._id;

  const send = await request(app).post(`/api/v1/surveys/${surveyId}/send`)
    .set("Authorization", `Bearer ${token}`)
    .send({ ticketId:"000000000000000000000001", customerEmail:"cust@ex.com" })
    .expect(201);

  const url: string = send.body.data.inviteUrl;
  const tokenPart = url.split("/").pop();

  await request(app).get(`/public/surveys/${tokenPart}`).expect(200);

  await request(app).post(`/public/surveys/${tokenPart}/submit`)
    .send({ answers:[{ key:"satisfaction", value:5 }] }).expect(201);
});
