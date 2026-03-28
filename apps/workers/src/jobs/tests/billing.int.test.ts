import { testSetup, testTeardown } from "../../../../../apps/api/src/tests/helpers";
import { Tenant } from "../../../../../apps/api/src/models/Tenant";
import { User } from "../../../../../apps/api/src/models/User";
import { Subscription } from "../../../../../apps/api/src/models/Subscription";
import { hashPassword } from "../../../../../apps/api/src/utils/auth";
import { processSubscriptionsNow } from "../billing";
import * as mailerMod from "../../../../../apps/api/src/services/mailer";
import { addDays } from "date-fns";

beforeAll(async () => { await testSetup(); });
afterAll(async () => { await testTeardown(); });

test("sends reminders and expires", async () => {
  const t = await Tenant.create({ slug:"trescrm", plan:"COMPANY", seats:20, branding:{ name:"TRES CRM", emailFrom:"no-reply@trescrm.local" } });
  await User.create({
    tenantId: t._id, firstName:"B", lastName:"I", email:"billing@trescrm.local",
    passwordHash: await hashPassword("x"), roles:["BILLING"], status:"ACTIVE"
  });

  const sendSpy = jest.spyOn(mailerMod.mailer, "sendMail").mockResolvedValue({} as any);

  // 7 days before end -> reminder
  const end = addDays(new Date(), 7);
  await Subscription.create({ tenantId: t._id, planCode:"CO-20", status:"ACTIVE", currentPeriodEnd: end });
  await processSubscriptionsNow(new Date()); // today
  expect(sendSpy).toHaveBeenCalled(); // reminder sent

  sendSpy.mockClear();
  // After end -> expire + email
  await Subscription.updateOne({ tenantId: t._id }, { $set: { currentPeriodEnd: addDays(new Date(), -1) }});
  await processSubscriptionsNow(new Date());
  expect(sendSpy).toHaveBeenCalled(); // expired email
  const sub = await Subscription.findOne({ tenantId: t._id }).lean();
  expect(sub?.status).toBe("EXPIRED");
});
