import mongoose from "mongoose";
import { app } from "../app";
import * as os from "os";
import * as path from "path";
import { addDays } from "date-fns";
import { Subscription } from "../models/Subscription";
import { resolvePlan } from "../billing/plans";

// Lazy import to avoid bundling if not used
let MongoMemoryServer: any | undefined;
let mongod: any | undefined;

const USE_MEMORY =
  process.env.USE_MEMORY_MONGO === "1" || process.env.CI === "true";

export async function testSetup() {
  if (USE_MEMORY) {
    const mod = await import("mongodb-memory-server");
    MongoMemoryServer = mod.MongoMemoryServer;
    mongod = await MongoMemoryServer.create({
      binary: {
        // cache to OS temp so subsequent runs are faster
        downloadDir: path.join(os.tmpdir(), "mongodb-binaries"),
        version: process.env.MONGOMS_VERSION || "7.0.14",
      },
    });
    const uri = mongod.getUri();
    await mongoose.connect(uri, { dbName: "test" });
  } else {
    // Use your local Docker Mongo
    const baseUri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/trescrm";
    const dbName = `trescrm_test_${process.pid}_${Date.now()}`;
    await mongoose.connect(baseUri, { dbName });
  }
  return app;
}

export async function testTeardown() {
  // drop only the test db we connected to
  try {
    await mongoose.connection.dropDatabase();
  } catch {}
  await mongoose.disconnect();

  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
}
export async function seedActiveSubscription(tenantId: string, planCode = "CO-20", days = 30) {
  const meta = resolvePlan(planCode) || resolvePlan("CO-20")!;
  const now = new Date();
  return Subscription.create({
    tenantId,
    planCode,
    status: "ACTIVE",
    seats: meta.seats,
    entitlements: meta.entitlements,
    currentPeriodStart: now,
    currentPeriodEnd: addDays(now, days),
    graceUntil: null,
    lastPaymentStatus: "PAID"
  });
}