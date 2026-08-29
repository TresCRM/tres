/**
 * Boot the API for the app end-to-end suite, backed by an ephemeral MongoDB.
 *
 * Runs as a Playwright webServer. Deliberately NOT started with NODE_ENV=test:
 * that mode disables CSRF and skips the MFA gate on privileged routes, which
 * are two of the things the suite is meant to exercise. The trade-off is that
 * privileged users must genuinely enrol in MFA before they can reach tickets,
 * customers or settings — the fixtures do exactly that, as a real operator
 * would.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = Number(process.env.E2E_API_PORT || 4400);
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:3100";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Where the connection details are published for the test process.
 *
 * The suite seeds tenants and users directly rather than through the HTTP API:
 * signup creates a PENDING user and mails a verification token that, with email
 * delivery disabled, goes nowhere — so there is no way to activate an account
 * over HTTP alone. Seeding also lets a test enrol a user in MFA with a known
 * secret, which is what makes the challenge flow testable.
 */
const STACK_FILE = path.resolve(__dirname, ".stack.json");

const mongod = await MongoMemoryServer.create({
  binary: { version: process.env.MONGOMS_VERSION || "7.0.14" },
});
const uri = mongod.getUri();
console.log(`[e2e-api] mongo ${uri}`);

fs.writeFileSync(
  STACK_FILE,
  JSON.stringify({ mongoUri: uri, apiUrl: `http://127.0.0.1:${PORT}` }, null, 2)
);

const api = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["ts-node", "apps/api/src/server.ts"],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(PORT),
      MONGO_URI: uri,
      JWT_SECRET: "e2e-jwt-secret-e2e-jwt-secret-32",
      SURVEY_JWT_SECRET: "e2e-survey-secret-e2e-survey-32",
      SMTP_DEFAULT_HOST: "localhost",
      SMTP_DEFAULT_PORT: "1025",
      SMTP_DEFAULT_SECURE: "false",
      // No SMTP server in CI; the API must not block on delivery.
      EMAILS_DISABLED: "1",
      // Abuse limits are covered by their own tests; leaving them on here would
      // throttle the suite's own setup traffic.
      DISABLE_RATE_LIMIT: "1",
      EVENTS_URL: "",
      ALLOWED_ORIGINS: `${WEB_ORIGIN},http://localhost:3100`,
    },
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  }
);

async function shutdown() {
  api.kill();
  fs.rmSync(STACK_FILE, { force: true });
  await mongod.stop().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
api.on("exit", (code) => {
  console.error(`[e2e-api] api process exited with ${code}`);
  mongod.stop().finally(() => process.exit(code ?? 1));
});
