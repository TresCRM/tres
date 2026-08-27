/**
 * @module tests/hardening.distributed-lock
 * Regression tests for HARDENINGS.md section 10 — scheduled work must run once
 * across the fleet, not once per replica.
 */
import { testSetup, testTeardown } from "../../tests/helpers";
import {
  DistributedLock,
  acquireLock,
  releaseLock,
  withLock,
} from "../../utils/distributedLock";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

let seq = 0;
const name = () => `test-lock-${++seq}`;

afterEach(async () => {
  await DistributedLock.deleteMany({});
});

describe("acquireLock", () => {
  test("grants a free lock", async () => {
    const handle = await acquireLock(name(), 10_000);
    expect(handle).not.toBeNull();
  });

  test("refuses a lock someone else holds", async () => {
    const n = name();

    const first = await acquireLock(n, 10_000);
    const second = await acquireLock(n, 10_000);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  test("grants the lock again once released", async () => {
    const n = name();

    const first = await acquireLock(n, 10_000);
    await releaseLock(first!);
    const second = await acquireLock(n, 10_000);

    expect(second).not.toBeNull();
  });

  test("takes over a lock whose holder died and let it expire", async () => {
    const n = name();
    await acquireLock(n, 10_000);
    // Simulate the holder vanishing without releasing.
    await DistributedLock.updateOne(
      { _id: n },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const takeover = await acquireLock(n, 10_000);

    expect(takeover).not.toBeNull();
  });

  test("different names do not contend", async () => {
    const a = await acquireLock(name(), 10_000);
    const b = await acquireLock(name(), 10_000);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  test("only one of a concurrent burst wins", async () => {
    const n = name();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => acquireLock(n, 10_000))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("records the holder so releases can be attributed", async () => {
    const n = name();
    const handle = await acquireLock(n, 10_000);

    const stored = await DistributedLock.findById(n).lean();
    expect(stored!.holder).toBe(handle!.holder);
  });
});

describe("releaseLock", () => {
  test("does not release a lock held by someone else", async () => {
    const n = name();
    const owner = await acquireLock(n, 10_000);

    // A stale handle from a previous holder must not free the current one.
    await releaseLock({ name: n, holder: "someone-else" });

    const stillHeld = await DistributedLock.findById(n).lean();
    expect(stillHeld).toBeTruthy();
    expect(stillHeld!.holder).toBe(owner!.holder);
    expect(await acquireLock(n, 10_000)).toBeNull();
  });
});

describe("withLock", () => {
  test("runs the work and reports that it ran", async () => {
    const fn = jest.fn(async () => "done");

    const outcome = await withLock(name(), 10_000, fn);

    expect(outcome).toEqual({ ran: true, result: "done" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("skips the work when another holder has the lock", async () => {
    const n = name();
    await acquireLock(n, 10_000);
    const fn = jest.fn(async () => "done");

    const outcome = await withLock(n, 10_000, fn);

    expect(outcome.ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  test("releases the lock afterwards", async () => {
    const n = name();

    await withLock(n, 10_000, async () => "done");

    expect(await DistributedLock.findById(n).lean()).toBeNull();
  });

  test("releases the lock even when the work throws", async () => {
    const n = name();

    await expect(
      withLock(n, 10_000, async () => {
        throw new Error("sweep failed");
      })
    ).rejects.toThrow("sweep failed");

    // A failing tick must not wedge every future tick.
    expect(await DistributedLock.findById(n).lean()).toBeNull();
  });

  test("concurrent callers run the work exactly once", async () => {
    const n = name();
    let runs = 0;
    const work = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 50));
    };

    const outcomes = await Promise.all([
      withLock(n, 10_000, work),
      withLock(n, 10_000, work),
      withLock(n, 10_000, work),
    ]);

    expect(runs).toBe(1);
    expect(outcomes.filter((o) => o.ran)).toHaveLength(1);
  });

  test("a later call proceeds once the earlier one has finished", async () => {
    const n = name();

    await withLock(n, 10_000, async () => "first");
    const second = await withLock(n, 10_000, async () => "second");

    expect(second).toEqual({ ran: true, result: "second" });
  });
});
