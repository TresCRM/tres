/**
 * Static host for the widget end-to-end tests.
 *
 * Serves a page that embeds the built widget exactly as a customer would, plus
 * a stub of the one API endpoint the widget calls. Stubbing here rather than
 * intercepting in the browser keeps the request a genuine same-origin fetch, so
 * the Content-Security-Policy assertions exercise the real thing.
 *
 * Everything is keyed by widget token rather than held as server-wide state:
 * the suite runs fully parallel against one server, so a mutable "next status"
 * would be set by one test and consumed by another.
 *
 * Routes:
 *   /?token=X                        host page embedding the widget as token X
 *   /csp?token=X                     same page under a strict policy
 *   /tres-widget.js                  the built bundle
 *   POST /api/public/widget/tickets  stubbed ticket creation
 *   /__requests?token=X              payloads received for that token
 *
 * A token of the form pub_e2e_fail_<code> makes the stub answer with <code>,
 * so a test picks its own failure mode by choosing its token.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(__dirname, "../../../packages/widget/dist/tres-widget.js");
const PORT = Number(process.env.PORT || 4310);

/**
 * The policy a security-conscious host would serve. Note what it does NOT
 * grant: no 'unsafe-inline' for scripts, so any inline handler in the widget is
 * refused by the browser. style-src does allow inline styles, because the
 * widget injects a <style> element into its shadow root.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
].join("; ");

/** token -> payloads received. Append-only; never read across tokens. */
const received = new Map();

function statusForToken(token) {
  const m = /^pub_e2e_fail_(\d{3})$/.exec(token || "");
  return m ? Number(m[1]) : 201;
}

function hostPage(token) {
  const safeToken = String(token).replace(/[^a-zA-Z0-9_-]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Widget host page</title>
  </head>
  <body>
    <h1>Host page</h1>
    <script
      src="/tres-widget.js"
      data-tenant="acme-co"
      data-token="${safeToken}"
      data-api-base="/api"
    ></script>
  </body>
</html>`;
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/public/widget/tickets") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { _unparseable: raw };
      }
      const token = payload?.widgetToken || "unknown";
      if (!received.has(token)) received.set(token, []);
      received.get(token).push(payload);

      const status = statusForToken(token);
      if (status !== 201) {
        return send(res, status, JSON.stringify({ error: "stubbed" }), {
          "Content-Type": "application/json",
        });
      }
      send(
        res,
        201,
        JSON.stringify({ data: { ticketId: "tkt_e2e_1", status: "OPEN" } }),
        { "Content-Type": "application/json" }
      );
    });
    return;
  }

  if (url.pathname === "/__requests") {
    const token = url.searchParams.get("token") || "";
    return send(res, 200, JSON.stringify(received.get(token) || []), {
      "Content-Type": "application/json",
    });
  }

  if (url.pathname === "/tres-widget.js") {
    if (!fs.existsSync(BUNDLE)) {
      return send(res, 500, "widget bundle missing — run `pnpm --filter @tres-crm/widget build`");
    }
    return send(res, 200, fs.readFileSync(BUNDLE), {
      "Content-Type": "text/javascript; charset=utf-8",
    });
  }

  if (url.pathname === "/" || url.pathname === "/csp") {
    const token = url.searchParams.get("token") || "pub_e2e_token";
    const headers = { "Content-Type": "text/html; charset=utf-8" };
    if (url.pathname === "/csp") headers["Content-Security-Policy"] = CSP;
    return send(res, 200, hostPage(token), headers);
  }

  send(res, 404, "not found");
});

server.listen(PORT, () => {
  console.log(`widget e2e host listening on http://127.0.0.1:${PORT}`);
});
