/**
 * @module utils/distributedLock
 * A best-effort mutual exclusion primitive backed by Mongo, for scheduled work
 * that must run once across a fleet rather than once per replica.
 *
 * Every replica runs the same cron timers, so an hourly billing sweep on three
 * replicas is three sweeps: three reminder emails, three expiry transitions.
 * Holding a lock for the duration of the tick makes that one sweep.
 *
 * Guarantees and limits, so callers can judge what this is safe for:
 *  - Acquisition is atomic. It relies on the unique _id, so two callers racing
 *    to take a free lock cannot both win.
 *  - A holder that dies does not wedge the lock: the entry carries an expiry
 *    and the next caller takes it over once that passes.
 *  - It is *not* a fencing token. If a holder stalls past its TTL, another
 *    replica will take the lock while the first is still running. Pick a TTL
 *    comfortably longer than the job, and keep jobs idempotent.
 */
import mongoose, { Schema, Types } from "mongoose";
import { randomUUID } from "crypto";

interface LockDoc {
  _id: string;
  holder: string;
  expiresAt: Date;
  acquiredAt: Date;
}

const LockSchema = new Schema<LockDoc>(
  {
    _id: { type: String, required: true },
    holder: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    acquiredAt: { type: Date, required: true },
  },
  { versionKey: false }
);

// Backstop only — expiry is enforced by comparing timestamps on acquire, since
// Mongo's TTL sweeper runs on roughly a one-minute cycle.
LockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DistributedLock =
  (mongoose.models.DistributedLock as mongoose.Model<LockDoc>) ||
  mongoose.model<LockDoc>("DistributedLock", LockSchema, "distributed_locks");

export interface LockHandle {
  name: string;
  holder: string;
}

/**
 * Try to take `name` for `ttlMs`. Returns null if another holder has it and
 * their claim has not expired.
 */
export async function acquireLock(name: string, ttlMs: number): Promise<LockHandle | null> {
  const holder = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // Matches only a free or expired lock. When a live one exists the filter
    // misses, upsert attempts an insert, and the unique _id rejects it — which
    // is exactly the signal that someone else holds it.
    await DistributedLock.findOneAndUpdate(
      { _id: name, expiresAt: { $lte: now } },
      { $set: { holder, expiresAt, acquiredAt: now } },
      { upsert: true }
    );
    return { name, holder };
  } catch (err: any) {
    if (err?.code === 11000) return null; // held by someone else
    throw err;
  }
}

/** Release a lock, but only if we still hold it. */
export async function releaseLock(handle: LockHandle): Promise<void> {
  await DistributedLock.deleteOne({ _id: handle.name, holder: handle.holder });
}

/**
 * Run `fn` under `name`, or skip it entirely if another replica holds the lock.
 * Returns whether the work ran. The lock is released even if `fn` throws, so a
 * failing tick does not block the next one.
 */
export async function withLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<{ ran: boolean; result?: T }> {
  const handle = await acquireLock(name, ttlMs);
  if (!handle) return { ran: false };

  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    await releaseLock(handle).catch(() => {
      // Losing the release is survivable — the TTL frees it.
    });
  }
}
