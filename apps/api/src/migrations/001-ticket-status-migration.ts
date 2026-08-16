/**
 * Migration 001: Ticket Status Migration
 *
 * Migrates tickets from the old 3-state system (ACTIVE/CLOSED/REOPENED)
 * to the new 8-state system (OPEN/ASSIGNED/IN_PROGRESS/AWAITING_CUSTOMER/
 * TRANSFERRED/RESOLVED/CLOSED/REOPENED).
 *
 * Mapping:
 *   ACTIVE  -> OPEN (or ASSIGNED if has assigneeId)
 *   CLOSED  -> CLOSED
 *   REOPENED -> REOPENED
 *
 * Run: npx ts-node apps/api/src/migrations/001-ticket-status-migration.ts
 */

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";

async function migrate() {
  console.log("[migration-001] Connecting to", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const tickets = db.collection("tickets");

  // Migrate ACTIVE -> OPEN (unassigned) or ASSIGNED (has assignee)
  const activeUnassigned = await tickets.updateMany(
    { status: "ACTIVE", assigneeId: { $exists: false } },
    {
      $set: { status: "OPEN" },
      $push: {
        statusHistory: {
          from: "ACTIVE",
          to: "OPEN",
          changedBy: "migration-001",
          reason: "Status migration: ACTIVE -> OPEN",
          timestamp: new Date(),
        },
      } as any,
    }
  );
  console.log(`[migration-001] ACTIVE (unassigned) -> OPEN: ${activeUnassigned.modifiedCount}`);

  const activeAssigned = await tickets.updateMany(
    { status: "ACTIVE", assigneeId: { $exists: true, $ne: null } },
    {
      $set: { status: "ASSIGNED" },
      $push: {
        statusHistory: {
          from: "ACTIVE",
          to: "ASSIGNED",
          changedBy: "migration-001",
          reason: "Status migration: ACTIVE -> ASSIGNED (has assignee)",
          timestamp: new Date(),
        },
      } as any,
    }
  );
  console.log(`[migration-001] ACTIVE (assigned) -> ASSIGNED: ${activeAssigned.modifiedCount}`);

  // CLOSED and REOPENED stay the same — just add initial statusHistory if missing
  const closedNoHistory = await tickets.updateMany(
    { status: "CLOSED", statusHistory: { $exists: false } },
    {
      $set: {
        statusHistory: [{
          from: "OPEN",
          to: "CLOSED",
          changedBy: "migration-001",
          reason: "Status migration: initialized history",
          timestamp: new Date(),
        }],
      },
    }
  );
  console.log(`[migration-001] CLOSED (init history): ${closedNoHistory.modifiedCount}`);

  const reopenedNoHistory = await tickets.updateMany(
    { status: "REOPENED", statusHistory: { $exists: false } },
    {
      $set: {
        statusHistory: [{
          from: "CLOSED",
          to: "REOPENED",
          changedBy: "migration-001",
          reason: "Status migration: initialized history",
          timestamp: new Date(),
        }],
      },
    }
  );
  console.log(`[migration-001] REOPENED (init history): ${reopenedNoHistory.modifiedCount}`);

  // Initialize missing fields on all tickets
  const initFields = await tickets.updateMany(
    { ttlRemindersSent: { $exists: false } },
    {
      $set: {
        ttlRemindersSent: 0,
        statusHistory: [],
      },
    }
  );
  console.log(`[migration-001] Initialized TTL fields: ${initFields.modifiedCount}`);

  console.log("[migration-001] Migration complete.");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("[migration-001] Failed:", err);
  process.exit(1);
});
