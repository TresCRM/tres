/**
 * TRES CRM Embeddable Widget
 *
 * Usage:
 *   <script src="https://cdn.trescrm.com/widget/v1/tres-widget.min.js"
 *     data-tenant="acme-co"
 *     data-token="pub_xxxx"
 *     data-position="bottom-right">
 *   </script>
 *
 * Or programmatically:
 *   TresCRM.init({ tenant: "acme-co", token: "pub_xxxx" });
 *
 * This file runs on other people's pages, so two constraints shape it:
 *  - No inline event handlers or inline `style` execution. Hosts commonly serve
 *    `script-src 'self' <widget-origin>`, and an inline handler is refused
 *    under that policy, which would silently break the control it is attached
 *    to.
 *  - Everything injected into markup or CSS is escaped or validated. Config
 *    reaches here from the host page's script tag and from tenant settings.
 */

export interface WidgetConfig {
  tenant: string;
  token: string;
  apiBase?: string;
  position?: "bottom-right" | "bottom-left";
  greeting?: string;
  accentColor?: string;
}

interface WidgetState {
  config: WidgetConfig | null;
  isOpen: boolean;
  root: ShadowRoot | null;
  /** Retained so destroy() can detach it; it is bound to document, not the host. */
  keydownHandler: ((e: KeyboardEvent) => void) | null;
}

const state: WidgetState = {
  config: null,
  isOpen: false,
  root: null,
  keydownHandler: null,
};

const HOST_ID = "tres-crm-widget";

/** Replaced at build time; see defaultApiBase(). */
declare const __TRES_API_BASE__: string | undefined;

/**
 * Where the widget talks to when the host does not say.
 *
 * This previously defaulted to http://localhost:4000, which shipped in the
 * built artifact — every embed without an explicit data-api-base pointed at the
 * visitor's own machine and silently failed.
 */
function defaultApiBase(): string {
  try {
    if (typeof __TRES_API_BASE__ !== "undefined" && __TRES_API_BASE__) {
      return __TRES_API_BASE__;
    }
  } catch {
    // Not defined by the bundler — fall through to the shipped default.
  }
  return "https://api.trescrm.com";
}

/**
 * Initialize the widget. Calling twice is a no-op rather than a second widget:
 * a host that both auto-inits from the script tag and calls init() by hand
 * would otherwise stack two launchers on the page.
 */
export function init(config: WidgetConfig): void {
  if (typeof document !== "undefined" && document.getElementById(HOST_ID)) return;
  if (state.config) return; // mount pending from a previous call

  state.config = {
    apiBase: defaultApiBase(),
    position: "bottom-right",
    ...config,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}

function mount(): void {
  if (!state.config) return;
  if (document.getElementById(HOST_ID)) return; // already mounted

  // Create host element with Shadow DOM for CSS isolation
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("aria-label", "Support widget");
  document.body.appendChild(host);

  state.root = host.attachShadow({ mode: "open" });

  // Inject styles
  const style = document.createElement("style");
  style.textContent = getStyles(state.config);
  state.root.appendChild(style);

  // Create launcher FAB
  const fab = document.createElement("button");
  fab.className = "tres-fab";
  fab.setAttribute("aria-label", "Open support widget");
  fab.setAttribute("type", "button");
  fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  fab.addEventListener("click", toggle);
  state.root.appendChild(fab);

  // Create panel (hidden initially)
  const panel = document.createElement("div");
  panel.className = "tres-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Support");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = getPanelHTML(state.config);
  state.root.appendChild(panel);

  // Bind behaviour that used to live in inline attributes.
  panel.querySelector(".tres-close")?.addEventListener("click", () => close());
  panel
    .querySelector(".tres-form")
    ?.addEventListener("submit", (e) => void handleSubmit(e as SubmitEvent));

  // Keyboard: Escape to close
  state.keydownHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && state.isOpen) toggle();
  };
  document.addEventListener("keydown", state.keydownHandler);
}

/**
 * Submit the form to the public widget endpoint.
 *
 * The form previously had `onsubmit="return false;"` and nothing listening, so
 * the widget collected input and discarded it — it never created a ticket.
 */
async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!state.config || !state.root) return;

  const form = state.root.querySelector(".tres-form") as HTMLFormElement | null;
  const submit = state.root.querySelector(".tres-submit") as HTMLButtonElement | null;
  const errorBox = state.root.querySelector(".tres-error") as HTMLElement | null;
  if (!form) return;

  const value = (sel: string) =>
    ((state.root!.querySelector(sel) as HTMLInputElement | null)?.value || "").trim();

  const payload = {
    widgetToken: state.config.token,
    name: value("#tres-name"),
    email: value("#tres-email"),
    subject: value("#tres-subject"),
    body: value("#tres-message"),
  };

  if (errorBox) errorBox.style.display = "none";
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Sending…";
  }

  try {
    const res = await fetch(`${trimSlash(state.config.apiBase!)}/public/widget/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // The server enforces a per-token ticket budget; say so plainly rather
      // than reporting a generic failure the visitor cannot act on.
      throw new Error(
        res.status === 429
          ? "Too many requests just now. Please try again shortly."
          : "We could not submit your ticket. Please try again."
      );
    }

    const data = await res.json();
    showConfirmation(data?.data?.ticketId);
  } catch (err: any) {
    if (errorBox) {
      errorBox.textContent = err?.message || "We could not submit your ticket.";
      errorBox.style.display = "block";
    }
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Send";
    }
  }
}

function showConfirmation(ticketId?: string): void {
  const form = state.root?.querySelector(".tres-form") as HTMLElement | null;
  const confirmation = state.root?.querySelector(".tres-confirmation") as HTMLElement | null;
  const idLine = state.root?.querySelector(".tres-ticket-id") as HTMLElement | null;

  if (form) form.style.display = "none";
  if (idLine && ticketId) idLine.textContent = `Reference: ${ticketId}`;
  if (confirmation) confirmation.style.display = "block";
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function toggle(): void {
  state.isOpen = !state.isOpen;
  const panel = state.root?.querySelector(".tres-panel");
  const fab = state.root?.querySelector(".tres-fab");
  if (panel) {
    panel.classList.toggle("open", state.isOpen);
    panel.setAttribute("aria-hidden", String(!state.isOpen));
  }
  if (fab) {
    fab.setAttribute("aria-expanded", String(state.isOpen));
  }
}

export function open(): void { if (!state.isOpen) toggle(); }
export function close(): void { if (state.isOpen) toggle(); }

export function destroy(): void {
  const host = document.getElementById(HOST_ID);
  if (host) host.remove();
  // Without this the listener outlives the widget, and a later init() would
  // leave two of them bound to document.
  if (state.keydownHandler) {
    document.removeEventListener("keydown", state.keydownHandler);
    state.keydownHandler = null;
  }
  state.config = null;
  state.isOpen = false;
  state.root = null;
}

function getPanelHTML(config: WidgetConfig): string {
  const greeting = config.greeting || "Hi! How can we help?";
  return `
    <div class="tres-header">
      <span class="tres-title">${escapeHtml(greeting)}</span>
      <button class="tres-close" type="button" aria-label="Close">&#x2715;</button>
    </div>
    <div class="tres-body">
      <form class="tres-form">
        <label for="tres-name">Name</label>
        <input id="tres-name" type="text" placeholder="Your name" required autocomplete="name" />
        <label for="tres-email">Email</label>
        <input id="tres-email" type="email" placeholder="you@example.com" required autocomplete="email" />
        <label for="tres-subject">Subject</label>
        <input id="tres-subject" type="text" placeholder="Brief summary" required />
        <label for="tres-message">Message</label>
        <textarea id="tres-message" rows="4" placeholder="Describe your issue..." required></textarea>
        <p class="tres-error" role="alert" style="display:none;"></p>
        <button type="submit" class="tres-submit">Send</button>
      </form>
      <div class="tres-confirmation" style="display:none;" role="alert">
        <p>&#x2713; Your ticket has been submitted!</p>
        <p class="tres-ticket-id"></p>
        <p>We'll email you with updates.</p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Single quotes matter as soon as a value lands in a single-quoted
    // attribute, which is easy to introduce later and hard to notice.
    .replace(/'/g, "&#39;");
}

/**
 * Accept only a literal colour.
 *
 * The accent is interpolated straight into a stylesheet, so an unvalidated
 * value can close the declaration and append rules of its own — enough to
 * restyle or hide parts of the host page.
 */
function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  const ok =
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ||
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(v) ||
    /^[a-z]{3,20}$/i.test(v); // named colours
  return ok ? v : fallback;
}

function getStyles(config: WidgetConfig): string {
  const accent = safeColor(config.accentColor, "#4F46E5");
  const pos = config.position === "bottom-left" ? "left: 20px;" : "right: 20px;";
  return `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; }
    .tres-fab { position: fixed; bottom: 20px; ${pos} width: 56px; height: 56px; border-radius: 50%; background: ${accent}; color: white; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 99999; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
    .tres-fab:hover { transform: scale(1.1); }
    .tres-fab:focus-visible { outline: 3px solid ${accent}; outline-offset: 2px; }
    .tres-panel { position: fixed; bottom: 88px; ${pos} width: 380px; max-height: 520px; background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); z-index: 99998; display: none; flex-direction: column; overflow: hidden; }
    .tres-panel.open { display: flex; }
    .tres-header { background: ${accent}; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; }
    .tres-title { font-weight: 600; font-size: 16px; }
    .tres-close { background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 4px 8px; }
    .tres-close:focus-visible { outline: 2px solid white; }
    .tres-body { padding: 16px; overflow-y: auto; flex: 1; }
    .tres-form label { display: block; font-weight: 500; margin: 8px 0 4px; color: #374151; }
    .tres-form input, .tres-form textarea { width: 100%; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    .tres-form input:focus, .tres-form textarea:focus { outline: 2px solid ${accent}; border-color: ${accent}; }
    .tres-error { color: #B91C1C; margin: 8px 0 0; font-size: 13px; }
    .tres-submit { width: 100%; margin-top: 12px; padding: 10px; background: ${accent}; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .tres-submit:hover { opacity: 0.9; }
    .tres-submit:focus-visible { outline: 3px solid ${accent}; outline-offset: 2px; }
    .tres-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .tres-confirmation { text-align: center; padding: 24px 0; }
    .tres-confirmation p { margin: 8px 0; color: #374151; }
    .tres-ticket-id { font-weight: 600; color: ${accent}; }
    @media (max-width: 640px) {
      .tres-panel { width: 100vw; height: 100vh; max-height: 100vh; bottom: 0; left: 0; right: 0; border-radius: 0; }
      .tres-fab { bottom: 16px; right: 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tres-fab { transition: none; }
    }
  `;
}

/** Exported for tests; not part of the public embed surface. */
export const __internals = { escapeHtml, safeColor, defaultApiBase, trimSlash };

// Auto-init from script tag attributes
export function autoInit(): void {
  if (typeof document === "undefined") return;
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const tenant = script.getAttribute("data-tenant");
  const token = script.getAttribute("data-token");
  if (tenant && token) {
    init({
      tenant,
      token,
      apiBase: script.getAttribute("data-api-base") || undefined,
      position: (script.getAttribute("data-position") as any) || undefined,
      accentColor: script.getAttribute("data-accent") || undefined,
    });
  }
}

autoInit();

// Expose global
if (typeof window !== "undefined") {
  (window as any).TresCRM = { init, open, close, destroy };
}
