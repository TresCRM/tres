/**
 * @jest-environment jsdom
 *
 * @module widget/index.test
 * Unit tests for the embeddable widget — HARDENINGS.md section 20.
 *
 * This script runs on other people's pages, so the properties under test are
 * mostly about not misbehaving there: no inline handlers (they are refused
 * under a normal script-src policy), no second widget on double init, no
 * listeners left behind after destroy, and a form that actually submits.
 */
import { init, open, close, destroy, autoInit, __internals } from "./index";

const { escapeHtml, safeColor, defaultApiBase, trimSlash } = __internals;

const CONFIG = { tenant: "acme", token: "pub_test_123", apiBase: "https://api.example.test" };

function host(): HTMLElement | null {
  return document.getElementById("tres-crm-widget");
}
function shadow(): ShadowRoot {
  return (host() as any).shadowRoot as ShadowRoot;
}
function q<T extends Element>(sel: string): T | null {
  return shadow().querySelector(sel) as T | null;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ data: { ticketId: "tkt_123", status: "OPEN" } }),
  }));
  (global as any).fetch = fetchMock;
});

afterEach(() => {
  destroy();
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

describe("escapeHtml", () => {
  test.each([
    ["<script>", "&lt;script&gt;"],
    ["a & b", "a &amp; b"],
    ['say "hi"', "say &quot;hi&quot;"],
    ["it's", "it&#39;s"],
  ])("escapes %s", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  test("escapes the ampersand first so entities are not double-built", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  test("leaves ordinary text alone", () => {
    expect(escapeHtml("Hi! How can we help?")).toBe("Hi! How can we help?");
  });

  test("a greeting cannot inject markup into the panel", () => {
    init({ ...CONFIG, greeting: '<img src=x onerror="alert(1)">' });

    // Assert on the parsed DOM, not the serialized HTML: the escaped text still
    // contains the substring "onerror=", it just is not an attribute.
    expect(shadow().querySelector("img")).toBeNull();
    expect(q(".tres-title")!.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("safeColor", () => {
  test.each(["#fff", "#4F46E5", "#4F46E5CC", "rgb(1,2,3)", "rgba(1,2,3,0.5)", "rebeccapurple"])(
    "accepts %s",
    (value) => {
      expect(safeColor(value, "#000")).toBe(value);
    }
  );

  test.each([
    "red; } body { display: none } .x {",
    "url(javascript:alert(1))",
    "expression(alert(1))",
    "#12",
    "",
  ])("rejects %p and falls back", (value) => {
    expect(safeColor(value, "#000")).toBe("#000");
  });

  test("a hostile accent cannot escape the stylesheet", () => {
    init({ ...CONFIG, accentColor: "red; } body { display: none } .x {" });

    const css = shadow().querySelector("style")!.textContent!;
    expect(css).not.toContain("body { display: none }");
  });
});

describe("defaultApiBase", () => {
  test("does not point at localhost", () => {
    // Shipping a localhost default meant every embed without data-api-base
    // silently talked to the visitor's own machine.
    expect(defaultApiBase()).not.toContain("localhost");
    expect(defaultApiBase()).toMatch(/^https:\/\//);
  });
});

describe("trimSlash", () => {
  test.each([
    ["https://api.test/", "https://api.test"],
    ["https://api.test///", "https://api.test"],
    ["https://api.test", "https://api.test"],
  ])("%s -> %s", (input, expected) => {
    expect(trimSlash(input)).toBe(expected);
  });
});

describe("init", () => {
  test("mounts a single host element with a shadow root", () => {
    init(CONFIG);

    expect(host()).toBeTruthy();
    expect(shadow()).toBeTruthy();
    expect(q(".tres-fab")).toBeTruthy();
    expect(q(".tres-panel")).toBeTruthy();
  });

  test("calling init twice does not create a second widget", () => {
    init(CONFIG);
    init(CONFIG);

    expect(document.querySelectorAll("#tres-crm-widget")).toHaveLength(1);
  });

  test("the panel starts closed", () => {
    init(CONFIG);

    expect(q(".tres-panel")!.getAttribute("aria-hidden")).toBe("true");
  });

  test("uses the shipped default when no apiBase is given", async () => {
    init({ tenant: "acme", token: "pub_x" });
    open();
    await submitForm();

    expect(fetchMock.mock.calls[0][0]).toBe(`${defaultApiBase()}/public/widget/tickets`);
  });
});

describe("open / close", () => {
  beforeEach(() => init(CONFIG));

  test("open reveals the panel and marks the launcher expanded", () => {
    open();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(true);
    expect(q(".tres-panel")!.getAttribute("aria-hidden")).toBe("false");
    expect(q(".tres-fab")!.getAttribute("aria-expanded")).toBe("true");
  });

  test("close hides it again", () => {
    open();
    close();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(false);
    expect(q(".tres-panel")!.getAttribute("aria-hidden")).toBe("true");
  });

  test("open twice is idempotent", () => {
    open();
    open();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(true);
  });

  test("the launcher button toggles the panel", () => {
    (q(".tres-fab") as HTMLButtonElement).click();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(true);
  });

  test("the close button closes the panel", () => {
    open();
    (q(".tres-close") as HTMLButtonElement).click();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(false);
  });

  test("Escape closes an open panel", () => {
    open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(q(".tres-panel")!.classList.contains("open")).toBe(false);
  });
});

describe("destroy", () => {
  test("removes the host element", () => {
    init(CONFIG);
    destroy();

    expect(host()).toBeNull();
  });

  test("detaches the document keydown listener", () => {
    init(CONFIG);
    open();
    destroy();

    // A listener surviving destroy would act on a widget that no longer exists,
    // and a later init() would leave two of them bound.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    ).not.toThrow();
  });

  test("allows a fresh init afterwards", () => {
    init(CONFIG);
    destroy();
    init(CONFIG);

    expect(document.querySelectorAll("#tres-crm-widget")).toHaveLength(1);
  });

  test("is safe to call when nothing is mounted", () => {
    expect(() => destroy()).not.toThrow();
  });
});

describe("content security policy", () => {
  test("the rendered markup carries no inline event handlers", () => {
    init(CONFIG);

    // Inline handlers are refused under script-src 'self' <widget-origin>,
    // which silently disables whatever control they were attached to.
    const html = shadow().innerHTML;
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  test("the close control works without an inline handler", () => {
    init(CONFIG);
    open();
    (q(".tres-close") as HTMLButtonElement).click();

    expect(q(".tres-panel")!.classList.contains("open")).toBe(false);
  });
});

/** Fill the form and dispatch a cancelable submit, as a browser would. */
async function submitForm(values: Partial<Record<string, string>> = {}) {
  const set = (sel: string, v: string) => {
    const el = q<HTMLInputElement>(sel);
    if (el) el.value = v;
  };
  set("#tres-name", values.name ?? "Ada");
  set("#tres-email", values.email ?? "ada@customer.test");
  set("#tres-subject", values.subject ?? "Printer broken");
  set("#tres-message", values.message ?? "It will not print");

  const form = q<HTMLFormElement>(".tres-form")!;
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  // Let the handler's promise chain settle.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("form submission", () => {
  beforeEach(() => {
    init(CONFIG);
    open();
  });

  test("posts the ticket to the public widget endpoint", async () => {
    await submitForm();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/public/widget/tickets");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  test("sends the widget token and the entered values", async () => {
    await submitForm({ subject: "Cannot log in" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      widgetToken: "pub_test_123",
      name: "Ada",
      email: "ada@customer.test",
      subject: "Cannot log in",
      body: "It will not print",
    });
  });

  test("does not navigate the host page", async () => {
    const form = q<HTMLFormElement>(".tres-form")!;
    const event = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  test("shows a confirmation with the ticket reference", async () => {
    await submitForm();

    const confirmation = q<HTMLElement>(".tres-confirmation")!;
    expect(confirmation.style.display).toBe("block");
    expect(q(".tres-ticket-id")!.textContent).toContain("tkt_123");
    expect(q<HTMLElement>(".tres-form")!.style.display).toBe("none");
  });

  test("surfaces a server error instead of failing silently", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await submitForm();

    const error = q<HTMLElement>(".tres-error")!;
    expect(error.style.display).toBe("block");
    expect(error.textContent).toBeTruthy();
    expect(q<HTMLElement>(".tres-confirmation")!.style.display).toBe("none");
  });

  test("explains a rate-limit rejection in terms the visitor can act on", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    await submitForm();

    expect(q(".tres-error")!.textContent).toMatch(/try again/i);
  });

  test("reports a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await submitForm();

    expect(q<HTMLElement>(".tres-error")!.style.display).toBe("block");
  });

  test("re-enables the submit button after a failure so the visitor can retry", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await submitForm();

    const submit = q<HTMLButtonElement>(".tres-submit")!;
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toBe("Send");
  });
});

describe("autoInit", () => {
  test("does nothing when the script tag carries no tenant or token", () => {
    autoInit();

    expect(host()).toBeNull();
  });

  test("mounts from data attributes on the executing script", () => {
    const script = document.createElement("script");
    script.setAttribute("data-tenant", "acme");
    script.setAttribute("data-token", "pub_auto_1");
    script.setAttribute("data-api-base", "https://auto.example.test");
    document.body.appendChild(script);
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });

    autoInit();

    expect(host()).toBeTruthy();
    Object.defineProperty(document, "currentScript", { value: null, configurable: true });
  });

  test("does not mount twice when the host also calls init", () => {
    const script = document.createElement("script");
    script.setAttribute("data-tenant", "acme");
    script.setAttribute("data-token", "pub_auto_2");
    document.body.appendChild(script);
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });

    autoInit();
    init(CONFIG);

    expect(document.querySelectorAll("#tres-crm-widget")).toHaveLength(1);
    Object.defineProperty(document, "currentScript", { value: null, configurable: true });
  });
});
