/**
 * Pure helpers used by the widget.
 *
 * These live outside index.ts deliberately. The bundle is built as an IIFE
 * named TresCRM, which means whatever index.ts exports becomes the public
 * global on every page that embeds the widget — so a test-only export there is
 * not test-only at all. Tests import this module directly instead.
 */

/** Replaced at build time; see defaultApiBase(). */
declare const __TRES_API_BASE__: string | undefined;

/**
 * Where the widget talks to when the host does not say.
 *
 * This previously defaulted to http://localhost:4000, which shipped in the
 * built artifact — every embed without an explicit data-api-base pointed at the
 * visitor's own machine and silently failed.
 */
export function defaultApiBase(): string {
  try {
    if (typeof __TRES_API_BASE__ !== "undefined" && __TRES_API_BASE__) {
      return __TRES_API_BASE__;
    }
  } catch {
    // Not defined by the bundler — fall through to the shipped default.
  }
  return "https://api.trescrm.com";
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function escapeHtml(s: string): string {
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
export function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  const ok =
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ||
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(v) ||
    /^[a-z]{3,20}$/i.test(v); // named colours
  return ok ? v : fallback;
}
