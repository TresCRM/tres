import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Further widget end-to-end coverage — HARDENINGS.md section 21 (widget items).
 *
 * These cover behaviour the widget only exhibits inside a real browser on a
 * real host page: surviving the host's CSS, keyboard and screen-reader
 * behaviour, the server's abuse limits, and the init/destroy lifecycle when
 * driven through the public global rather than through module imports.
 */

const HOST = "#tres-crm-widget";
const FAB = `${HOST} >> .tres-fab`;
const PANEL = `${HOST} >> .tres-panel`;
const SUBMIT = `${HOST} >> .tres-submit`;
const CONFIRMATION = `${HOST} >> .tres-confirmation`;
const ERROR = `${HOST} >> .tres-error`;

let tokenSeq = 0;
const uniqueToken = () => `pub_e2e_res_${process.pid}_${++tokenSeq}`;

async function openHost(page: Page, token: string, pathname = "/") {
  await page.goto(`${pathname}?token=${token}`);
  await page.waitForSelector(FAB);
}

async function fillForm(page: Page) {
  await page.fill(`${HOST} >> #tres-name`, "Ada Lovelace");
  await page.fill(`${HOST} >> #tres-email`, "ada@customer.test");
  await page.fill(`${HOST} >> #tres-subject`, "Printer is on fire");
  await page.fill(`${HOST} >> #tres-message`, "It will not stop printing.");
}

/* ------------------------------------------------------------------ */
/*  Isolation from the host page's stylesheet                          */
/* ------------------------------------------------------------------ */

test.describe("isolation from host page CSS", () => {
  test("host styles do not reach inside the widget", async ({ page }) => {
    // The host page applies `* { color: red !important; ... }`. Shadow DOM is
    // the reason that stops at the boundary — if the widget were ever rendered
    // into the light DOM, it would inherit all of this.
    await openHost(page, uniqueToken(), "/hostile-css");
    await page.click(FAB);

    const styles = await page.evaluate(() => {
      const root = document.getElementById("tres-crm-widget")!.shadowRoot!;
      const title = root.querySelector(".tres-title") as HTMLElement;
      const submit = root.querySelector(".tres-submit") as HTMLElement;
      const cs = getComputedStyle(title);
      return {
        titleColor: cs.color,
        titleFontSize: cs.fontSize,
        submitDisplay: getComputedStyle(submit).display,
      };
    });

    expect(styles.titleColor).not.toBe("rgb(255, 0, 0)");
    expect(styles.titleFontSize).not.toBe("40px");
  });

  test("the host's `display: none` on inputs does not hide the widget's", async ({ page }) => {
    await openHost(page, uniqueToken(), "/hostile-css");
    await page.click(FAB);

    // The host page sets `input, textarea { display: none !important }`.
    await expect(page.locator(`${HOST} >> #tres-name`)).toBeVisible();
    await expect(page.locator(`${HOST} >> #tres-message`)).toBeVisible();
  });

  test("the widget still works end to end on a hostile page", async ({ page }) => {
    await openHost(page, uniqueToken(), "/hostile-css");
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);

    await expect(page.locator(CONFIRMATION)).toBeVisible();
  });

  test("the widget does not restyle the host page", async ({ page }) => {
    await openHost(page, uniqueToken());

    const hostHeadingColor = await page.evaluate(
      () => getComputedStyle(document.querySelector("h1")!).color
    );

    // :host { all: initial } applies inside the shadow root only; the widget
    // must not leak its own styling outward either.
    expect(hostHeadingColor).toBe("rgb(0, 0, 0)");
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility                                                      */
/* ------------------------------------------------------------------ */

test.describe("accessibility", () => {
  test("no serious or critical axe violations with the panel open", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);

    const results = await new AxeBuilder({ page }).include("#tres-crm-widget").analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );

    expect(
      serious.map((v) => `${v.id}: ${v.help}`),
      "serious/critical accessibility violations"
    ).toEqual([]);
  });

  test("opening the panel moves focus into it", async ({ page }) => {
    await openHost(page, uniqueToken());

    await page.click(FAB);

    // Focus inside a shadow root is reported by the root, not by document.
    const focused = await page.evaluate(() => {
      const root = document.getElementById("tres-crm-widget")!.shadowRoot!;
      return (root.activeElement as HTMLElement | null)?.id ?? null;
    });
    expect(focused).toBe("tres-name");
  });

  test("Tab is trapped inside the dialog", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);

    // Walk past the end of the form; focus must come back to the first control
    // rather than escaping to the host page.
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");

    const insideWidget = await page.evaluate(() => {
      const root = document.getElementById("tres-crm-widget")!.shadowRoot!;
      return root.activeElement !== null;
    });
    expect(insideWidget).toBe(true);
  });

  test("closing restores focus to the launcher", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);

    await page.keyboard.press("Escape");

    const focusedClass = await page.evaluate(() => {
      const root = document.getElementById("tres-crm-widget")!.shadowRoot!;
      return (root.activeElement as HTMLElement | null)?.className ?? null;
    });
    expect(focusedClass).toBe("tres-fab");
  });

  test("the dialog is labelled and its state is exposed", async ({ page }) => {
    await openHost(page, uniqueToken());

    await expect(page.locator(PANEL)).toHaveAttribute("role", "dialog");
    await expect(page.locator(PANEL)).toHaveAttribute("aria-hidden", "true");

    await page.click(FAB);

    await expect(page.locator(PANEL)).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator(FAB)).toHaveAttribute("aria-expanded", "true");
  });
});

/* ------------------------------------------------------------------ */
/*  Server-side abuse limits, as the visitor experiences them          */
/* ------------------------------------------------------------------ */

test.describe("rate limiting", () => {
  test("submissions past the budget are refused with a friendly message", async ({ page }) => {
    // The stub allows two creates for this token and then answers 429, standing
    // in for the real per-token ticket budget.
    // Unique per run: the three browser projects share one stub server.
    const token = `pub_e2e_budget_2_${process.pid}_${++tokenSeq}`;
    await openHost(page, token);
    await page.click(FAB);

    for (let i = 0; i < 2; i++) {
      await fillForm(page);
      await page.click(SUBMIT);
      await expect(page.locator(CONFIRMATION)).toBeVisible();
      await page.reload();
      await page.waitForSelector(FAB);
      await page.click(FAB);
    }

    await fillForm(page);
    await page.click(SUBMIT);

    await expect(page.locator(ERROR)).toBeVisible();
    await expect(page.locator(ERROR)).toContainText(/try again/i);
    await expect(page.locator(CONFIRMATION)).toBeHidden();
  });

  test("the visitor can still retry after being throttled", async ({ page }) => {
    await openHost(page, `pub_e2e_fail_429`);
    await page.click(FAB);
    await fillForm(page);

    await page.click(SUBMIT);
    await expect(page.locator(ERROR)).toBeVisible();

    await expect(page.locator(SUBMIT)).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ */
/*  Lifecycle through the public global                                */
/* ------------------------------------------------------------------ */

test.describe("init and destroy through window.TresCRM", () => {
  test("the global surface is exposed", async ({ page }) => {
    await openHost(page, uniqueToken());

    // The bundle is an IIFE named TresCRM, so whatever index.ts exports lands
    // on this global. Anything test-only must therefore live elsewhere.
    const api = await page.evaluate(() =>
      Object.keys((window as any).TresCRM || {}).sort()
    );
    expect(api).toEqual(["autoInit", "close", "destroy", "init", "open"]);
    expect(api).not.toContain("__internals");
  });

  test("calling init again does not mount a second widget", async ({ page }) => {
    await openHost(page, uniqueToken());

    await page.evaluate(() =>
      (window as any).TresCRM.init({ tenant: "acme-co", token: "pub_second", apiBase: "/api" })
    );

    await expect(page.locator(HOST)).toHaveCount(1);
  });

  test("destroy removes the widget from the page", async ({ page }) => {
    await openHost(page, uniqueToken());

    await page.evaluate(() => (window as any).TresCRM.destroy());

    await expect(page.locator(HOST)).toHaveCount(0);
  });

  test("destroy detaches the document keydown listener", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.click(FAB);
    await page.evaluate(() => (window as any).TresCRM.destroy());

    // A listener surviving destroy would act on a widget that no longer exists.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.keyboard.press("Escape");

    expect(errors).toEqual([]);
    await expect(page.locator(HOST)).toHaveCount(0);
  });

  test("the widget can be re-initialised after destroy", async ({ page }) => {
    await openHost(page, uniqueToken());
    await page.evaluate(() => (window as any).TresCRM.destroy());

    await page.evaluate(() =>
      (window as any).TresCRM.init({ tenant: "acme-co", token: "pub_again", apiBase: "/api" })
    );

    await expect(page.locator(HOST)).toHaveCount(1);
    await expect(page.locator(FAB)).toBeVisible();
  });
});
