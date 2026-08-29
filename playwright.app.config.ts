import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the web application.
 *
 * Kept separate from playwright.config.ts (the widget suite) because the two
 * need entirely different stacks: the widget suite serves a static page and a
 * stub, while this one boots the real API against an ephemeral MongoDB and the
 * Next dev server. A single config would start all of it for every run.
 *
 * Chromium only by default. The application is an internal console reached by
 * staff on a browser they were issued; the cross-browser argument belongs to
 * the embeddable widget, which lands on visitors' machines. Set E2E_ALL_BROWSERS
 * to widen it.
 */
const API_PORT = Number(process.env.E2E_API_PORT || 4400);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3100);
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;

const allBrowsers = !!process.env.E2E_ALL_BROWSERS;

export default defineConfig({
  testDir: "./tests/e2e/app",
  testIgnore: ["**/fixtures/**"],
  fullyParallel: false, // shared API and database; keep the ordering predictable
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: allBrowsers
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: "node tests/e2e/app/fixtures/start-api.mjs",
      url: `${API_ORIGIN}/healthz`,
      reuseExistingServer: !process.env.CI,
      // First run downloads the in-memory MongoDB binary.
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_ORIGIN: WEB_ORIGIN,
      },
    },
    {
      command: "pnpm --filter web dev",
      url: WEB_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: String(WEB_PORT),
        // Read at compile time by the dev server, so it must be set here.
        NEXT_PUBLIC_API_BASE_URL: `${API_ORIGIN}/api/v1`,
      },
    },
  ],
});
