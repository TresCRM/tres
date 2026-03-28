import "dotenv/config";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
import mongoose, { Types } from "mongoose";
import { Subscription } from "../../../../apps/api/src/models/Subscription";
import { Tenant } from "../../../../apps/api/src/models/Tenant";
import { User } from "../../../../apps/api/src/models/User";
import { mailer } from "../../../../apps/api/src/services/mailer";
import { writeActivity } from "../../../../apps/api/src/services/activity";

type Reminder = 7 | 3 | 1;

function shouldSendReminder(now: Date, end: Date, days: Reminder) {
  const trigger = startOfDay(addDays(end, -days));
  // run once per day window; you can persist "lastNotifiedX" if needed later
  return now >= trigger && now < addDays(trigger, 1);
}

export async function processSubscriptionsNow(now = new Date()) {
  const today = startOfDay(now);

  // ACTIVE about to expire -> send reminders
  const actives = await Subscription.find({ status: "ACTIVE" }).lean();
  for (const s of actives) {
    const end = s.currentPeriodEnd;
    if (shouldSendReminder(today, end, 7) || shouldSendReminder(today, end, 3) || shouldSendReminder(today, end, 1)) {
      await sendReminderEmail(s.tenantId, end);
      await writeActivity({ tenantId: String(s.tenantId), action:"SUBSCRIPTION_REMINDER", level:"AUDIT", meta:{ currentPeriodEnd: end } });
    }
    // Expire if past end (simple MVP; add grace if needed)
    if (isAfter(today, end)) {
      await Subscription.updateOne({ _id: s._id }, { $set: { status: "EXPIRED" }});
      await sendExpiredEmail(s.tenantId, end);
      await writeActivity({ tenantId: String(s.tenantId), action:"SUBSCRIPTION_EXPIRED", level:"AUDIT", meta:{ currentPeriodEnd: end } });
    }
  }
}

async function sendReminderEmail(tenantId: Types.ObjectId, end: Date) {
  const tenant = await Tenant.findById(tenantId).lean();
  const users = await User.find({ tenantId, roles: { $in: ["BILLING","OWNER"] }, status:"ACTIVE" }).lean();
  const to = users.map(u => u.email).join(", ");
  if (!to) return;

  const from = tenant?.branding?.emailFrom ?? "no-reply@trescrm.local";
  const subject = `Your TRES CRM subscription renews on ${end.toDateString()}`;
  const html = `<p>Hi,</p>
    <p>Your subscription is set to renew on <b>${end.toDateString()}</b>.</p>
    <p>Please ensure your billing details are up to date.</p>`;

  await mailer.sendMail({ from, to, subject, html });
}

async function sendExpiredEmail(tenantId: Types.ObjectId, end: Date) {
  const tenant = await Tenant.findById(tenantId).lean();
  const users = await User.find({ tenantId, roles: { $in: ["BILLING","OWNER"] }, status:"ACTIVE" }).lean();
  const to = users.map(u => u.email).join(", ");
  if (!to) return;

  const from = tenant?.branding?.emailFrom ?? "no-reply@trescrm.local";
  const subject = `Your TRES CRM subscription expired`;
  const html = `<p>Hi,</p>
    <p>Your subscription expired on <b>${end.toDateString()}</b>.</p>
    <p>Writes are now disabled. Please renew to restore full access.</p>`;

  await mailer.sendMail({ from, to, subject, html });
}
