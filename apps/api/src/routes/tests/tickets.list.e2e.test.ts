import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Ticket } from "../../models/Ticket";
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

  // seed tickets
  await Ticket.create([
    { tenantId:t._id, subject:"Login issue", body:"Can't login", status:"ACTIVE", priority:"HIGH", createdBy:u._id, tags:["auth"] },
    { tenantId:t._id, subject:"Billing Q", body:"Invoice?", status:"ACTIVE", priority:"LOW", createdBy:u._id, tags:["billing"] },
    { tenantId:t._id, subject:"UI bug", body:"Button off", status:"CLOSED", priority:"MEDIUM", createdBy:u._id, tags:["ui"] }
  ]);
});

afterAll(async () => { await testTeardown(); });

test("list tickets default", async () => {
  const r = await request(app).get("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`).expect(200);
  expect(Array.isArray(r.body.data)).toBe(true);
  expect(r.body.data.length).toBeGreaterThanOrEqual(3);
});

test("filter by status & search", async () => {
  const r = await request(app).get("/api/v1/tickets")
    .set("Authorization", `Bearer ${token}`)
    .query({ status:"ACTIVE", q:"invoice" })
    .expect(200);
  expect(r.body.data.length).toBe(1);
  expect(r.body.data[0].subject).toMatch(/Billing/i);
});

test("cursor pagination", async () => {
  const r1 = await request(app).get("/api/v1/tickets?limit=2")
    .set("Authorization", `Bearer ${token}`).expect(200);
  expect(r1.body.data.length).toBe(2);
  expect(r1.body.nextCursor).toBeTruthy();

  const r2 = await request(app).get(`/api/v1/tickets?limit=2&cursor=${encodeURIComponent(r1.body.nextCursor)}`)
    .set("Authorization", `Bearer ${token}`).expect(200);
  // next page should have >= 1 more (based on seeds)
  expect(r2.body.data.length).toBeGreaterThanOrEqual(1);
});
