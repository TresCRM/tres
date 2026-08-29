import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 4310);

/**
 * End-to-end configuration for the embeddable widget.
 *
 * The widget is the one thing in this repo that runs on code we do not control,
 * against browsers we do not choose, so it is tested on all three engines
 * rather than on Chromium alone. WebKit in particular is the one that will be
 * reached by Safari and every iOS browser.
 *
 * The suite serves its own host page and stubs the single API endpoint the
 * widget calls, so it needs no database, no API process and no network.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // The app suite lives under tests/e2e/app and needs an API, a database and
  // the web server. Without this it would be collected here too and fail with
  // nothing running — which is exactly what happened when it was added.
  testIgnore: ["**/app/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  webServer: {
    // The bundle is what customers embed, so the tests exercise the built
    // artifact rather than the source.
    command: "pnpm --filter @tres-crm/widget build && node tests/e2e/fixtures/serve.mjs",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
