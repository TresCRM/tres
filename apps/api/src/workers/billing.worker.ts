import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongoose"; // ensure connection
import { 
  Subscription 
} from "../models/Subscription";
import { 
  getPlanByCode, 
  monthsForInterval, 
  Interval, 
  PlanCode 
} from "../billing/plans";
import { sendEmail } from "../services/mailer";                // Ensure .env is loaded

const GRACE_DAYS = Number(process.env.GRACE_DAYS || 7);

function addMonths(d: Date, months: number) { const x = new Date(d); x.setMonth(x.getMonth() + months); return x; }
function daysBetween(a: Date, b: Date) { return Math.ceil((b.getTime() - a.getTime()) / 86400000); }

async function sendDunning(to: string, subject: string, html: string, text: string, key: string) {
  if (process.env.EMAILS_DISABLED) return;
  await sendEmail({ to, subject, html, text, messageKey: key });
}

async function runOnce(now = new Date()) {
  const due = await Subscription.find({
    $or: [
      { currentPeriodEnd: { $lte: now }, status: { $in: ["ACTIVE","PAST_DUE","GRACE"] } },
      { graceUntil: { $lte: now }, status: "GRACE" }
    ]
  });

  for (const sub of due) {
    const plan = getPlanByCode(sub.planCode as PlanCode);
    if (!plan) continue;

    // If grace elapsed -> EXPIRED
    if (sub.status === "GRACE" && sub.graceUntil && sub.graceUntil <= now) {
      sub.status = "EXPIRED";
      await sub.save();
      await sendDunning("owner@trescrm.local", "Subscription expired",
        `<p>Your subscription expired. Please update payment to regain write access.</p>`,
        "Subscription expired. Please update payment.", `billing_expired_${String(sub._id)}`);
      continue;
    }

    // Attempt renewal (MVP: manual outcome – you could fail by env)
    const shouldFail = process.env.BILLING_FORCE_FAIL === "1";
    if (!shouldFail) {
      // success -> extend period
      const months = monthsForInterval(sub.interval as Interval);
      const start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      sub.currentPeriodStart = start;
      sub.currentPeriodEnd = addMonths(start, months);
      sub.status = "ACTIVE";
      sub.graceUntil = null;
      sub.failedPaymentCount = 0;
      sub.lastPaymentAt = now;
      await sub.save();

      await sendDunning("owner@trescrm.local", "Payment received",
        `<p>Thanks! Your plan is active until ${sub.currentPeriodEnd.toISOString()}.</p>`,
        `Active until ${sub.currentPeriodEnd.toISOString()}`,
        `billing_paid_${String(sub._id)}_${Date.now()}`);
    } else {
      // fail -> GRACE start/extend
      sub.status = "GRACE";
      sub.graceUntil = new Date(now.getTime() + GRACE_DAYS * 86400000);
      sub.failedPaymentCount = (sub.failedPaymentCount || 0) + 1;
      await sub.save();
      await sendDunning("owner@trescrm.local", "Payment failed",
        `<p>We couldn't process your renewal. You have ${GRACE_DAYS} days of grace.</p>`,
        `Payment failed. Grace ${GRACE_DAYS} days.`,
        `billing_failed_${String(sub._id)}_${Date.now()}`);
    }
  }

  // Dunning reminders for approaching renewal (T-7/T-3/T-1)
  const coming = await Subscription.find({ status:"ACTIVE" });
  for (const sub of coming) {
    const days = daysBetween(now, sub.currentPeriodEnd);
    if ([7,3,1].includes(days)) {
      await sendDunning("owner@trescrm.local", `Renewal in ${days} day(s)`,
        `<p>Your ${sub.planCode} renews in ${days} day(s).</p>`,
        `Renews in ${days} day(s).`,
        `billing_t${days}_${String(sub._id)}_${Date.now()}`);
    }
  }
}

if (require.main === module) {
  (async () => {
    try {
      await connectMongo();             // <-- wait for DB
      await runOnce();                  // your existing logic
      console.log("[billing] done");
      await disconnectMongo();          // clean exit
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  })();
}
export { runOnce };
