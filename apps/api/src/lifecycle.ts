/**
 * @module lifecycle
 * Graceful shutdown manager — tracks running jobs, registers cleanup
 * callbacks, and orchestrates orderly process termination.
 */
import pino from "pino";

const log = pino({ name: "lifecycle" });

const SHUTDOWN_TIMEOUT_MS = 30_000;

// ─── State ──────────────────────────────────────────────────────────

const runningJobs = new Set<Promise<unknown>>();
const shutdownCallbacks: Array<() => Promise<void> | void> = [];
let shuttingDown = false;
let forceRequested = false;

// ─── Public API ─────────────────────────────────────────────────────

/** Returns true once a shutdown signal has been received. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Track a background job so shutdown waits for it to finish.
 * The promise is automatically removed from the set when it settles.
 */
export function registerJob(name: string, promise: Promise<unknown>): void {
  log.debug({ job: name }, "Registered background job");
  runningJobs.add(promise);
  const cleanup = () => {
    runningJobs.delete(promise);
  };
  promise.then(cleanup, cleanup);
}

/**
 * Register a cleanup callback to run during shutdown
 * (e.g. DB disconnect, NATS drain, HTTP server close).
 */
export function onShutdown(callback: () => Promise<void> | void): void {
  shutdownCallbacks.push(callback);
}

/**
 * Wire SIGTERM / SIGINT handlers. Call once at startup.
 */
export function initGracefulShutdown(): void {
  const handler = async (signal: string) => {
    if (forceRequested) {
      log.warn({ signal }, "Forced shutdown");
      process.exit(1);
    }

    if (shuttingDown) {
      // Second signal — mark force for next time
      log.warn({ signal }, "Second signal received — next signal will force exit");
      forceRequested = true;
      return;
    }

    shuttingDown = true;
    log.info({ signal }, "Shutting down...");

    // 1. Wait for running jobs with a timeout
    if (runningJobs.size > 0) {
      log.info({ count: runningJobs.size }, "Waiting for running jobs to finish");
      const allJobs = Promise.allSettled([...runningJobs]);
      const timeout = new Promise<void>((resolve) =>
        setTimeout(() => {
          log.warn("Shutdown timeout reached — proceeding with cleanup");
          resolve();
        }, SHUTDOWN_TIMEOUT_MS),
      );
      await Promise.race([allJobs, timeout]);
    }

    // 2. Run cleanup callbacks sequentially
    for (const cb of shutdownCallbacks) {
      try {
        await cb();
      } catch (err) {
        log.error({ err }, "Shutdown callback error");
      }
    }

    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("SIGINT", () => handler("SIGINT"));
}
