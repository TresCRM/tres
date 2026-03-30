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
}

const state: WidgetState = {
  config: null,
  isOpen: false,
  root: null,
};

const DEFAULT_API_BASE = "http://localhost:4000";

/**
 * Initialize the widget. Call once per page load.
 */
export function init(config: WidgetConfig): void {
  state.config = {
    apiBase: DEFAULT_API_BASE,
    position: "bottom-right",
    ...config,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}

function mount(): void {
  if (!state.config) return;

  // Create host element with Shadow DOM for CSS isolation
  const host = document.createElement("div");
  host.id = "tres-crm-widget";
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

  // Keyboard: Escape to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.isOpen) toggle();
  });
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
  const host = document.getElementById("tres-crm-widget");
  if (host) host.remove();
  state.config = null;
  state.isOpen = false;
  state.root = null;
}

function getPanelHTML(config: WidgetConfig): string {
  const greeting = config.greeting || "Hi! How can we help?";
  return `
    <div class="tres-header">
      <span class="tres-title">${escapeHtml(greeting)}</span>
      <button class="tres-close" aria-label="Close" onclick="this.getRootNode().host.querySelector('.tres-fab').click()">&#x2715;</button>
    </div>
    <div class="tres-body">
      <form class="tres-form" onsubmit="return false;">
        <label for="tres-name">Name</label>
        <input id="tres-name" type="text" placeholder="Your name" required autocomplete="name" />
        <label for="tres-email">Email</label>
        <input id="tres-email" type="email" placeholder="you@example.com" required autocomplete="email" />
        <label for="tres-subject">Subject</label>
        <input id="tres-subject" type="text" placeholder="Brief summary" required />
        <label for="tres-message">Message</label>
        <textarea id="tres-message" rows="4" placeholder="Describe your issue..." required></textarea>
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
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function getStyles(config: WidgetConfig): string {
  const accent = config.accentColor || "#4F46E5";
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

// Auto-init from script tag attributes
(function autoInit() {
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
})();

// Expose global
if (typeof window !== "undefined") {
  (window as any).TresCRM = { init, open, close, destroy };
}
