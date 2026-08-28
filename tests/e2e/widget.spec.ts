import { test, expect, type Page } from "@playwright/test";

/**
 * Widget end-to-end coverage — HARDENINGS.md section 20.
 *
 * Two properties the unit tests cannot establish, because both depend on real
 * browser behaviour:
 *
 *  - The widget works on Chromium, Firefox and WebKit. It is embedded on other
 *    people's sites, so Safari and every iOS browser are in scope whether we
 *    test them or not.
 *  - It works under a strict Content-Security-Policy. Inline handlers are
 *    refused under `script-src 'self'`, and jsdom neither enforces CSP nor
 *    reports violations — so a regression there is invisible to unit tests and
 *    would surface as a dead button on a customer's site.
 *
 * The suite runs fully parallel against one stub server, so each test that
 * cares about server behaviour uses its own widget token: the stub keys
 * everything by token and derives its response status from it. Nothing here
 * mutates shared state.
 */

/** The widget lives in a shadow root; Playwright pierces it automatically. */
const FAB = "#tres-crm-widget >> .tres-fab";
const PANEL = "#tres-crm-widget >> .tres-panel";
const SUBMIT = "#tres-crm-widget >> .tres-submit";
const CONFIRMATION = "#tres-crm-widget >> .tres-confirmation";
const ERROR = "#tres-crm-widget >> .tres-error";

/** Tokens of this shape make the stub answer with the encoded status. */
const failWith = (code: number) => `pub_e2e_fail_${code}`;

/** A token unique to one test, so parallel runs cannot see each other's calls. */
let tokenSeq = 0;
const uniqueToken = () => `pub_e2e_ok_${process.pid}_${++tokenSeq}`;

async function openHost(page: Page, token: string, pathname: "/" | "/csp" = "/") {
  await page.goto(`${pathname}?token=${token}`);
  await page.waitForSelector(FAB);
}

async function submittedPayloads(page: Page, token: string) {
  const res = await page.request.get(`/__requests?token=${token}`);
  return res.json();
}

async function fillForm(page: Page) {
  await page.fill("#tres-crm-widget >> #tres-name", "Ada Lovelace");
  await page.fill("#tres-crm-widget >> #tres-email", "ada@customer.test");
  await page.fill("#tres-crm-widget >> #tres-subject", "Printer is on fire");
  await page.fill("#tres-crm-widget >> #tres-message", "It will not stop printing.");
}

test.describe("widget on a plain host page", () => {
  test("mounts a launcher from the script tag attributes", async ({ page }) => {
    await openHost(page, uniqueToken());

    await expect(page.locator(FAB)).toBeVisible();
  });

  test("mounts exactly one widget", async ({ page }) => {
    await openHost(page, uniqueToken());

    await expect(page.locator("#tres-crm-widget")).toHaveCount(1);
  });

  test("the panel is hidden until the launcher is used", async ({ page }) => {
    await openHost(page, uniqueToken());
    await expect(page.locator(PANEL)).toBeHidden();

    await page.click(FAB);

    await expect(page.locator(PANEL)).toBeVisible();
  });

  test("the close control dismisses the panel", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);

    await page.click("#tres-crm-widget >> .tres-close");

    await expect(page.locator(PANEL)).toBeHidden();
  });

  test("Escape dismisses the panel", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);

    await page.keyboard.press("Escape");

    await expect(page.locator(PANEL)).toBeHidden();
  });

  test("submitting the form creates a ticket", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);

    await expect(page.locator(CONFIRMATION)).toBeVisible();
    await expect(page.locator("#tres-crm-widget >> .tres-ticket-id")).toContainText("tkt_e2e_1");
  });

  test("the submission carries the token and the entered values", async ({ page }) => {
    const token = uniqueToken();
    await openHost(page, token);
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);
    await expect(page.locator(CONFIRMATION)).toBeVisible();

    const payloads = await submittedPayloads(page, token);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      widgetToken: token,
      name: "Ada Lovelace",
      email: "ada@customer.test",
      subject: "Printer is on fire",
      body: "It will not stop printing.",
    });
  });

  test("submitting does not navigate the host page away", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);
    await expect(page.locator(CONFIRMATION)).toBeVisible();

    // A form that posted natively would leave the page; the handler must
    // preventDefault. The <h1> only exists on the host page itself.
    await expect(page.locator("h1")).toHaveText("Host page");
  });

  test("a server failure is reported rather than swallowed", async ({ page }) => {
    await openHost(page, failWith(500));
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);

    await expect(page.locator(ERROR)).toBeVisible();
    await expect(page.locator(CONFIRMATION)).toBeHidden();
  });

  test("a rate-limited submission explains itself", async ({ page }) => {
    await openHost(page, failWith(429));
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);

    await expect(page.locator(ERROR)).toContainText(/try again/i);
  });

  test("the visitor can retry after a failure", async ({ page }) => {
    await openHost(page, failWith(503));
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);
    await expect(page.locator(ERROR)).toBeVisible();

    await expect(page.locator(SUBMIT)).toBeEnabled();
    await expect(page.locator(SUBMIT)).toHaveText("Send");
  });
});

test.describe("widget under a strict Content-Security-Policy", () => {
  /**
   * Collect anything the browser refuses. Inline handlers, inline scripts and
   * disallowed connections all surface here; an empty list is the assertion.
   */
  function watchViolations(page: Page) {
    const violations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/content security policy|refused to (execute|apply|connect|load)/i.test(text)) {
        violations.push(text);
      }
    });
    page.on("pageerror", (err) => violations.push(String(err)));
    return violations;
  }

  test("mounts without violating the policy", async ({ page }) => {
    const violations = watchViolations(page);

    await openHost(page, uniqueToken(), "/csp");

    await expect(page.locator(FAB)).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("the launcher and close control still work", async ({ page }) => {
    const violations = watchViolations(page);
    await openHost(page, uniqueToken(), "/csp");

    await page.click(FAB);
    await expect(page.locator(PANEL)).toBeVisible();

    await page.click("#tres-crm-widget >> .tres-close");
    await expect(page.locator(PANEL)).toBeHidden();

    // These were inline onclick attributes, which this policy refuses — the
    // buttons would render and do nothing.
    expect(violations).toEqual([]);
  });

  test("the form submits under the policy", async ({ page }) => {
    const violations = watchViolations(page);
    await openHost(page, uniqueToken(), "/csp");

    await page.click(FAB);
    await fillForm(page);
    await page.click(SUBMIT);

    await expect(page.locator(CONFIRMATION)).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("the rendered markup carries no inline event handlers", async ({ page }) => {
    await openHost(page, uniqueToken(), "/csp");

    const html = await page.evaluate(() => {
      const el = document.getElementById("tres-crm-widget");
      return el?.shadowRoot?.innerHTML ?? "";
    });

    expect(html).not.toMatch(/\son[a-z]+=["']/i);
  });
});
