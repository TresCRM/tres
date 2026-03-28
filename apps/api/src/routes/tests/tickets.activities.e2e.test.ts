import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
// import { Ticket } from "../../models/Ticket";
import { hashPassword } from "../../utils/auth";
import * as emitter from "../../events/emitter";
// import { Subscription } from "../../models/Subscription";
import { seedActiveSubscription } from "../../tests/helpers";

let app:any, token:string, tenantId:string, adminId:string, agentId:string;

beforeAll(async () => {
  app = await testSetup();
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM" } });
  tenantId = String(t._id);
  const admin = await User.create({
    tenantId: t._id, firstName:"Admin", lastName:"User", email:"admin@trescrm.local",
    passwordHash: await hashPassword("x"), roles:["ADMIN"], status:"ACTIVE"
  });
  const agent = await User.create({
    tenantId: t._id, firstName:"Agent", lastName:"User", email:"agent@trescrm.local",
    passwordHash: await hashPassword("x"), roles:["AGENT"], status:"ACTIVE"
  });
  adminId = String(admin._id);
  agentId = String(agent._id);
  token = jwt.sign({ sub: adminId, tid: tenantId, roles:["ADMIN"] }, process.env.JWT_SECRET!, { expiresIn:"1h" });
  await seedActiveSubscription(tenantId);
});

afterAll(async () => { await testTeardown(); });

test("assign + reply emits events", async () => {
  const spy = jest.spyOn(emitter, "emitTicketEvent").mockImplementation(() => {});

  // create
  const c = await request(app).post("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject:"Abcdef", body:"Bdefghijk" })
    .expect(201);
  const id = c.body.data._id;

  // assign
  await request(app).post(`/api/v1/tickets/${id}/assign`)
    .set("Authorization", `Bearer ${token}`)
    .send({ assigneeId: agentId })
    .expect(200);

  // reply
  await request(app).post(`/api/v1/tickets/${id}/reply`)
    .set("Authorization", `Bearer ${token}`)
    .send({ body:"Thanks, looking!" })
    .expect(201);

  // close
  await request(app).post(`/api/v1/tickets/${id}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send({})
    .expect(200);

  const events = spy.mock.calls.map(c => c[1]?.event);
  expect(events).toContain("ticket.created");
  expect(events).toContain("ticket.assigned");
  expect(events).toContain("ticket.replied");
  expect(events).toContain("ticket.closed");

  spy.mockRestore();
});
