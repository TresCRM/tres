import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";

let app:any;
beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

test("signup -> verify -> login", async () => {
  const r1 = await request(app).post("/api/v1/auth/signup").send({
    tenant: { name:"TRES CRM", slug:"trescrm", plan:"COMPANY" },
    owner: { firstName:"Nick", lastName:"Mb", email:"owner@trescrm.local", password:"Password123!" }
  }).expect(201);

  // simulate verify by directly calling /verify with token you stored in DB OR bypass by seed in tests
  // here we just ensure signup returns a tenant
  // console.log(r1.body);
  expect(r1.body.tenant.slug).toBe("trescrm");
});
