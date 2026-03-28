import "dotenv/config";
import { connectMongo } from "../db/mongoose";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { Customer } from "../models/Customer";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { hashPassword } from "../utils/auth";
import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import { Plan } from "../models/Plan";
import { Subscription } from "../models/Subscription";
import { getPlanByCode, monthsForInterval } from "../billing/plans";

async function ensurePlans() {
  const plans = [
    { code: "IND-1", name: "Individual", seats: 1, priceMonthly: 0, active: true },
    { code: "CO-20", name: "Company 20", seats: 20, priceMonthly: 99, active: true }
  ];
  for (const p of plans) {
    const exists = await Plan.findOne({ code: p.code });
    if (!exists) await Plan.create(p);
  }
}

async function ensureActiveSubscription(tenantId: any, planCode = "CO-20") {
  let sub = await Subscription.findOne({ tenantId });
  if (!sub) {
    sub = await Subscription.create({
      tenantId,
      planCode,
      status: "ACTIVE",
      currentPeriodEnd: addDays(new Date(), 30)
    });
    console.log(`Subscription created: ${planCode}, ACTIVE until ${sub.currentPeriodEnd.toISOString()}`);
  } else if (sub.status !== "ACTIVE") {
    await Subscription.updateOne(
      { _id: sub._id },
      { $set: { status: "ACTIVE", planCode, currentPeriodEnd: addDays(new Date(), 30) } }
    );
    console.log(`Subscription reset to ACTIVE for plan ${planCode}`);
  }
}


async function run() {
  await connectMongo();
  let tenant = await Tenant.findOne({ slug: "trescrm" });
  if (!tenant) {
    tenant = await Tenant.create({
      slug: "trescrm",
      plan: "COMPANY",
      seats: 20,
      branding: {
        name: "TRES CRM",
        primaryColor: "#1a73e8",
        surfaceColor: "#f1f3f4",
        emailFrom: "no-reply@trescrm.local"
      }
    });
    console.log("Created tenant:", tenant.slug);
  }

  await ensurePlans();
  await ensureActiveSubscription(tenant._id, "CO-20");
  const plan = getPlanByCode("CO-20")!;
  const now = new Date();
  const end = new Date(now.getTime()); end.setMonth(end.getMonth() + monthsForInterval("MONTH"));

  await Subscription.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      planCode: plan.code,
      interval: "MONTH",
      seats: plan.seats,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: end,
      graceUntil: null,
      entitlements: plan.entitlements,
      lastPaymentAt: now
    },
    { upsert: true, new: true }
  );

  const [admin, agent] = await Promise.all([
    ensureUser(tenant._id, "Admin", "User", "admin@trescrm.local", ["OWNER","ADMIN"], "Password123!"),
    ensureUser(tenant._id, "Agent", "User", "agent@trescrm.local", ["AGENT"], "Password123!")
  ]);

  const customers = await ensureCustomers(tenant._id);
  console.log(`Customers: ${customers.length}`);

  const tickets = await ensureTickets(tenant._id, admin._id, agent._id, customers);
  console.log(`Tickets: ${tickets.length}`);

  await ensureComments(tenant._id, admin._id, tickets);
  console.log("Comments added.");

  console.log("Demo seed complete.");
  process.exit(0);
}

async function ensureUser(tenantId: any, first: string, last: string, email: string, roles: string[], pass: string) {
  let u = await User.findOne({ tenantId, email });
  if (!u) {
    u = await User.create({
      tenantId, firstName: first, lastName: last, email,
      passwordHash: await hashPassword(pass), roles, status: "ACTIVE"
    });
    console.log("User:", email, "(Password123!)");
  }
  return u;
}

async function ensureCustomers(tenantId: any) {
  const list = [
    ["Ada Lovelace", "ada@lovelabs.dev", "Lovelabs"],
    ["Grace Hopper", "grace@navy.mil", "US Navy"],
    ["Alan Turing", "alan@bletchley.uk", "Bletchley Park"],
    ["Linus Torvalds", "linus@kernel.org", "Kernel Org"],
    ["Margaret Hamilton", "margaret@mit.edu", "MIT"],
    ["Tim Berners-Lee", "tim@w3.org", "W3C"],
    ["Katherine Johnson", "katherine@nasa.gov", "NASA"],
    ["Guido van Rossum", "guido@python.org", "Python"],
    ["Barbara Liskov", "barbara@mit.edu", "MIT"],
    ["Ken Thompson", "ken@bell-labs.com", "Bell Labs"]
  ];
  const out: any[] = [];
  for (const [name, email, company] of list) {
    let c = await Customer.findOne({ tenantId, email });
    if (!c) c = await Customer.create({ tenantId, name, email, company });
    out.push(c);
  }
  return out;
}

async function ensureTickets(tenantId: any, adminId: any, agentId: any, customers: any[]) {
  const sample = [
    ["Login issue", "Can't login to dashboard", "HIGH", customers[0]],
    ["Invoice missing", "I can't find last month's invoice", "MEDIUM", customers[1]],
    ["Bug: save button", "Save button is unresponsive", "LOW", customers[2]],
    ["Feature: export", "CSV export request", "LOW", customers[3]],
    ["Wrong total", "Billing total seems off", "HIGH", customers[4]],
    ["Mobile layout", "Sidebar overlays on iPhone", "MEDIUM", customers[5]],
    ["Webhook 500", "We see 500 on webhook endpoint", "HIGH", customers[6]],
    ["Account transfer", "Move data to new account", "LOW", customers[7]],
  ] as const;

  const created: any[] = [];
  for (const [subject, body, priority, cust] of sample) {
    const exists = await Ticket.findOne({ tenantId, subject });
    if (exists) { created.push(exists); continue; }

    const t = await Ticket.create({
      tenantId, 
      subject, 
      body, 
      priority,
      customerEmail: cust.email,
      tags: ["demo"],
      watchers: [cust.email],
      createdBy: adminId,
      assigneeId: agentId,
      requestId: randomUUID()
    });
    created.push(t);
  }
  return created;
}

async function ensureComments(tenantId: any, adminId: any, tickets: any[]) {
  for (const t of tickets) {
    const count = await Comment.countDocuments({ tenantId, ticketId: t._id });
    if (count > 0) continue;

    await Comment.create({
      tenantId, ticketId: t._id, authorId: adminId, body: "We are investigating. Thanks!", isAgent: true
    });
    await Comment.create({
      tenantId, ticketId: t._id, authorId: adminId, body: "Update: fix being tested.", isAgent: true
    });
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

