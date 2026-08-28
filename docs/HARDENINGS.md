# HARDENINGS — TRES CRM A–Z Review

Branch: `rbac-implement` · Date: 2026-08-16 · Reviewer: Claude Opus 4.7 (1M)

Purpose: A modular catalogue of every issue needing resolution before this branch is production-ready. Each module has a checklist of concrete, actionable items with file:line references. Items marked **[P0]** are release-blocking, **[P1]** should ship before general availability, **[P2]** should ship within the quarter, **[P3]** is polish/nice-to-have.

Index (jump to module):
1. [API — Auth, RBAC & Session](#1-api--auth-rbac--session)
2. [API — Multi-Tenancy Isolation](#2-api--multi-tenancy-isolation)
3. [API — Data Models & Indexes](#3-api--data-models--indexes)
4. [API — Route Handlers & Response Hygiene](#4-api--route-handlers--response-hygiene)
5. [API — Public/Widget/Ext Endpoints](#5-api--publicwidgetext-endpoints)
6. [API — Billing (Paystack) & Webhooks](#6-api--billing-paystack--webhooks)
7. [API — Realtime / WebSocket](#7-api--realtime--websocket)
8. [API — Observability & Logging](#8-api--observability--logging)
9. [API — Configuration & Environment](#9-api--configuration--environment)
10. [Workers — Background Jobs](#10-workers--background-jobs)
11. [Packages — SDK, Widget, Types](#11-packages--sdk-widget-types)
12. [Infrastructure — Helm, Terraform, Docker](#12-infrastructure--helm-terraform-docker)
13. [CI/CD & Root Tooling](#13-cicd--root-tooling)
14. [Web — Auth, Middleware, Session](#14-web--auth-middleware-session)
15. [Web — Layout, Nav, Empty States](#15-web--layout-nav-empty-states)
16. [Web — Client Data Fetching & State](#16-web--client-data-fetching--state)
17. [Web — Accessibility (a11y)](#17-web--accessibility-a11y)
18. [Web — Performance](#18-web--performance)
19. [**UI Enhancements — Calendars, Selects, Inputs, Icons, Loaders**](#19-ui-enhancements)
20. [**Chat Widget Embed Script — Industry-Standard Hardening**](#20-chat-widget-embed-script)
21. [**Playwright E2E Coverage for UI Enhancements**](#21-playwright-e2e-coverage)

---

## 1. API — Auth, RBAC & Session

- [x] **[P0]** `apps/api/src/middlewares/auth.ts:129` — `requireMfaForPrivileged` fails open on DB error (`.catch(() => next())`). Log and return 403 instead. — **FIXED 2026-08-26: now fails closed — a lookup error logs and returns 403 instead of calling next()**
- [x] **[P0]** `apps/api/src/routes/auth.ts:323-330` — MFA ticket is not bound to IP/User-Agent; a leaked ticket can complete MFA. Bind ticket to (userId, IP-hash, UA-hash) and require CSRF on `/mfa-verify`. — **FIXED 2026-08-26: the ticket is pinned to a SHA-256 of the requesting client's IP + User-Agent, checked on /mfa-verify, and burned on mismatch. NOTE: CSRF was not added — /mfa-verify is reached without a session and the attacker would already need the ticket, so the binding is the substantive control. The separate durability concern is now also resolved: challenges moved to the MfaChallenge TTL collection 2026-08-26**
- [ ] **[P1]** `apps/api/src/config/env.ts:64-71` — `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` silently fall back to `JWT_SECRET`. Require both in production and enforce uniqueness at boot.
- [ ] **[P1]** `apps/api/src/middlewares/apiKeyAuth.ts:80` — Fire-and-forget `lastUsedAt` update swallows errors. Queue via async logger or accept eventual consistency but log failures to Sentry.
- [ ] **[P1]** `apps/api/src/models/ApiKey.ts` — No per-key brute-force protection on prefix guessing. Add rate limiter keyed by prefix (max 100 failed attempts/min).
- [ ] **[P1]** Add refresh-token rotation with reuse detection (invalidate family on replay).
- [ ] **[P2]** Session invalidation on password change / role change is currently missing — verify and add a `sessionEpoch` field on User bumped on those events; require in JWT.

## 2. API — Multi-Tenancy Isolation

- [x] **[P0]** `apps/api/src/routes/emailTracking.ts:80-84` — `Customer.updateMany({ email })` is **not** scoped by `tenantId`. Bounce event for one tenant flips flags across all tenants. Add `tenantId` filter. — **FIXED 2026-08-26: tenant resolved from event metadata or the recorded outbound EmailMessage; skips the write when unresolvable rather than writing across tenants. Also added the emailBounced/emailBouncedAt/bounceReason paths to CustomerSchema — strict mode was silently dropping them, so the flag was never persisted at all**
- [x] **[P0]** `apps/api/src/routes/paystackWebhook.ts:172-178` — Falls back to `paystackCustomerCode` alone if `tenantId` missing. Reject webhook if metadata `tenantId` is absent. — **FIXED 2026-08-26: handlePaymentFailed now requires metadata.tenantId and no longer falls back to paystackCustomerCode. NOTE: handleSubscriptionCreate still resolves by customer code, which is the only identifier Paystack sends on subscription events — left as-is deliberately**
- [ ] **[P1]** `apps/api/src/routes/public.tickets.ts:204-246` — `String(ticket.tenantId) !== payload.tid` risks coercion mismatch when `tenantId` is null. Add explicit null guard → 404.
- [ ] **[P1]** Introduce a repository/query helper that requires `tenantId` as a mandatory arg for every Mongoose call (e.g., `withTenant(model, tenantId).find(...)`). Enforce via lint rule.
- [ ] **[P2]** Add an integration test suite that seeds two tenants and asserts every list/get endpoint rejects cross-tenant IDs.

## 3. API — Data Models & Indexes

- [x] **[P0]** `apps/api/src/models/Subscription.ts` — No unique constraint on `tenantId`. Add `{ tenantId: 1 }` unique index. — **VERIFIED ALREADY DONE: Subscription.ts:70 has index({ tenantId: 1 }, { unique: true })**
- [ ] **[P1]** `apps/api/src/models/Comment.ts` — Add `maxlength: 50000` on `body` to enforce schema-level cap matching API validation.
- [ ] **[P1]** `apps/api/src/models/Ticket.ts:53` — `customFields: Map<string, any>` accepts any value. Restrict to primitives (string/number/bool/date) and cap map size to 20.
- [ ] **[P1]** `apps/api/src/models/WidgetToken.ts` — Add `expiresAt`, `lastUsedAt`, and a TTL index (default 90 days).
- [ ] **[P1]** `apps/api/src/models/User.ts` — Add compound index `{ tenantId: 1, status: 1 }` for active-agent lookups.
- [ ] **[P1]** `apps/api/src/models/Webhook.ts` — Add Mongoose custom validator on URL to block private-IP/localhost values (defence-in-depth for SSRF).
- [ ] **[P2]** `apps/api/src/models/ActivityLog.ts` — Cap serialized `body` size (e.g., truncate at 8 KB) to prevent unbounded document growth.
- [ ] **[P2]** Audit every model for missing `createdAt/updatedAt` (Mongoose `timestamps: true`).

## 4. API — Route Handlers & Response Hygiene

- [x] **[P0]** `apps/api/src/routes/public.tickets.ts:221-229` — Public ticket-comment fetch does **not** filter `isInternal`. Internal comments leak to unauthenticated customers. Add `isInternal: { $ne: true }` to the query. — **VERIFIED ALREADY DONE: both comment queries (lines 222, 392) filter isInternal: { $ne: true }**
- [x] **[P0]** `apps/api/src/routes/public.widget.ts:221` — Widget ticket GET returns all comments including internal ones. Same fix. — **FIXED 2026-08-26: added isInternal: { $ne: true }. Note .select() alone was insufficient — it hid the flag but still returned the note body**
- [ ] **[P1]** `apps/api/src/routes/ext.ts:98,128` — External API responses return full Mongoose documents (leaks internal IDs). Use `.select()` / DTO projection.
- [ ] **[P1]** `apps/api/src/routes/public.tickets.ts:325-326,337` — Pagination via `parseInt` without Zod validation; cursor-less skip/limit can double-return rows on inserts. Move to Zod validation and cursor-based pagination.
- [ ] **[P1]** Audit all list endpoints for missing `.select()` projection — exclude internal-only fields (`__v`, internal IDs, PII where not needed).
- [ ] **[P2]** `apps/api/src/routes/analytics.ts` — CSV exports must enforce a row cap (10 K) or stream results.
- [ ] **[P2]** Standardize error envelopes — replace ad-hoc `res.status(x).json({error})` with a single `sendError(res, code, message, details?)` helper.

## 5. API — Public / Widget / Ext Endpoints

- [x] **[P0]** `apps/api/src/routes/public.widget.ts:29-50` — Domain allowlist uses `.endsWith('.' + hostname)`. `example.com.evil.com` will pass `.endsWith('.evil.com')`. Replace with exact hostname match (case-insensitive) or a strict subdomain rule. — **VERIFIED ALREADY DONE: exact hostname match or true subdomain; the described suffix bypass does not apply**
- [x] **[P0]** `apps/api/src/routes/public.widget.ts:34,120-121` — If `allowedDomains` is empty, all origins are accepted. Fail closed. — **FIXED 2026-08-26: now fails closed — a token with no configured domains is rejected instead of accepting every origin**
- [x] **[P0]** `apps/api/src/routes/public.tickets.ts` — No rate limit on public ticket creation. Add IP + email compound throttle (10/hour/IP, 3/day/email). — **FIXED 2026-08-27: publicTicketIpLimiter (10/hour/IP) and publicTicketEmailLimiter (3/day/email) on POST /public/tickets. The email key reads customerEmail (the field the public API actually sends) and falls back to the IP when absent, so one malformed caller cannot share a bucket with everyone**
- [x] **[P0]** `apps/api/src/routes/public.widget.ts` — No rate limit on widget endpoints. Add per-token throttle (5 tickets/hour, 1000 requests/hour). — **FIXED 2026-08-27: widgetTicketLimiter (5 tickets/hour/token) on widget ticket creation and widgetTokenLimiter (1000 req/hour/token) at the widget mount**
- [ ] **[P1]** `apps/api/src/routes/public.tickets.ts:138-142` — Customer token returned in HTTP response body AND email. Return via email only; response returns ticket ID + masked email.
- [ ] **[P1]** `apps/api/src/routes/public.surveys.ts` — Rate limit survey responses (10/hour/IP per link).
- [ ] **[P2]** `apps/api/src/routes/public.tickets.ts:557-590` — Log repeated portal-access requests as potential enumeration.

## 6. API — Billing (Paystack) & Webhooks

- [x] **[P0]** `apps/api/src/routes/paystackWebhook.ts:28-44` — Webhook signature verified, but no idempotency guard. Retries create duplicate invoices. Persist event ID in `IdempotencyResult` collection with unique index; short-circuit if seen. — **FIXED 2026-08-26: event claimed in ProcessedWebhookEvent (unique on provider+eventKey, 30d TTL) before any handler runs; duplicate key returns 200 immediately. The claim is released if processing throws, so a transient failure still gets retried**
- [x] **[P0]** `apps/api/src/routes/paystackWebhook.ts:82-95` — `handleChargeSuccess` upserts without checking existing invoice by reference. Enforce unique-by-reference lookup first. — **FIXED 2026-08-26: Invoice gained providerReference with a unique partial index; createInvoice returns the existing invoice for a reference it has already billed**
- [x] **[P0]** `apps/api/src/routes/webhooks.ts:39-43` — Outbound webhook URL only Zod-validated as `.url()`. Add SSRF guard: block private/link-local/loopback ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7). — **FIXED 2026-08-26: added utils/ssrf.ts and applied it to the create/update schemas and at dispatch time. Blocks non-http(s) schemes, credentials in URL, loopback/private/link-local/CGNAT/multicast v4, ::1 fc00::/7 fe80::/10 and IPv4-mapped v6, plus localhost/.local/bare hostnames. Does not resolve DNS — see the module comment**
- [ ] **[P1]** `apps/api/src/billing/paystackProvider.ts:159-174` — `verifyWebhook` doesn't validate payload structure. Zod-validate `{ event, data }` shape.
- [ ] **[P1]** Add 5 s timeout on all outbound Paystack API calls in webhook path.
- [ ] **[P1]** Add signed retries with exponential backoff on outbound webhook dispatcher; expose per-endpoint failure metrics.
- [ ] **[P2]** Reconciliation job: nightly compare Paystack transactions vs local invoices for drift.

- [x] **[P0]** `apps/api/src/app.ts:51` — **FOUND & FIXED 2026-08-26 (not previously catalogued):** `express.json()` was mounted before `mountRoutes()`, so the paystack router's `express.raw()` never saw the body. `verifyWebhook` received a parsed object and HMAC'd the string `"[object Object]"`, so **no genuine Paystack signature could ever validate** — every real webhook was rejected with 400 and no subscription could activate via webhook. The raw parser is now mounted for that path before `express.json()`.

## 7. API — Realtime / WebSocket

- [ ] **[P1]** `apps/api/src/realtime/ws.ts:64` — Token verified once at connect; no re-verification. Store token expiry; disconnect on expiry; re-verify every 5 min or on suspicious event.
- [ ] **[P1]** `apps/api/src/realtime/ws.ts:108-111` — Presence broadcasts fan out to entire tenant with no RBAC filter. Filter by resource ACL.
- [ ] **[P1]** Add max-connections-per-tenant limit; drop oldest on breach.
- [ ] **[P2]** Throttle `busPublish` per user (once/5 s).
- [ ] **[P2]** `apps/api/src/realtime/ws.ts:72` — Parse errors silently caught. Log to Sentry with connection metadata.

## 8. API — Observability & Logging

- [ ] **[P1]** Replace all `.catch(() => {})` fire-and-forget patterns with a bounded async logger. Grep for `catch(()=>` and `catch(() =>` and triage each.
- [ ] **[P1]** `apps/api/src/observability/sentry.ts` — Hardcoded `tracesSampleRate: 0.1`. Make configurable via `SENTRY_TRACES_SAMPLE_RATE`.
- [ ] **[P1]** `apps/api/src/services/webhookDispatcher.ts:50,84` — Delivery attempts not logged. Emit structured log per attempt (status, duration, response code).
- [ ] **[P1]** `apps/api/src/middlewares/errorHandler.ts` — `ErrorLog.create` via `setImmediate` fire-and-forget. Move to durable queue.
- [ ] **[P2]** Add OpenTelemetry traces around: Mongo queries > 200 ms, external HTTP calls, NATS publish/subscribe.
- [ ] **[P2]** Add tenantId as a Sentry tag on every exception for triage grouping.

## 9. API — Configuration & Environment

- [ ] **[P1]** `apps/api/src/middlewares/audit.ts:9` — Reads `process.env.ACTIVITY_LOG_ENABLED` directly. Move to `config/env.ts`.
- [ ] **[P1]** `apps/api/src/routes/emailTracking.ts:36` — `EMAIL_WEBHOOK_SECRET` optional in prod. Require it in production; only allow missing in `NODE_ENV=test`.
- [ ] **[P1]** `apps/api/src/config/env.ts:79` — `SMTP_PORT` parsed as int with no range check. Add `.min(1).max(65535)`.
- [ ] **[P2]** Add a boot-time env self-check script that validates every required var and prints a red banner if any are missing (visible in Helm logs).

## 10. Workers — Background Jobs

- [x] **[P0]** `apps/workers/src/index.ts:21-40` — NATS subscription has no graceful shutdown. Add `SIGTERM`/`SIGINT` handler that unsubscribes and drains before exit. — **FIXED 2026-08-27: SIGTERM/SIGINT drain the NATS subscription and connection, clear the billing timer, close the health server and disconnect mongoose, with a 15s cap before forced exit. A failing ticket email no longer tears down the subscription loop either**
- [x] **[P0]** `apps/workers/src/jobs/billing.ts:18` — `setInterval` billing job with no distributed lock. Two replicas will double-charge. Use Redis Redlock or Mongo TTL lock. — **FIXED 2026-08-27: the hourly sweep runs under a Mongo TTL lock (utils/distributedLock.ts), so only one replica sweeps. The same lock was applied to the API's billing cron, which had the identical exposure and is the one that actually renews subscriptions and raises invoices. Taken at the scheduler seam so direct runOnce() callers and tests are unaffected**
- [ ] **[P1]** `apps/workers/src/index.ts:27-40` — Failed messages logged to console only. Add NATS JetStream durable consumer + DLQ subject.
- [ ] **[P1]** `apps/workers/src/index.ts:27-40` — For-await loop wraps no try/catch around handler. Catch, log, ack/DLQ.
- [ ] **[P1]** `apps/workers/src/jobs/billing.ts:38-41` — `sendReminderEmail` queries users by tenantId without verifying tenant. Add tenant existence check.
- [ ] **[P1]** Add per-handler concurrency limits (e.g., `piscina` worker pool or semaphore).
- [ ] **[P1]** Add `/healthz` and `/readyz` HTTP endpoints in workers reflecting NATS+Mongo state.
- [ ] **[P2]** Emit per-job metrics (duration, success/fail) via OTel to Prometheus/Grafana.

## 11. Packages — SDK, Widget, Types

- [ ] **[P1]** `packages/sdk/package.json`, `packages/widget/package.json` — Add `exports` field so consumers can't import internal paths and get correct ESM/CJS resolution.
- [ ] **[P1]** `packages/widget/package.json` — `devDependencies: {}` is empty; Vite/TS are transitive. Pin explicitly.
- [ ] **[P2]** `packages/sdk/README.md` — Add usage examples; auto-generate reference via TypeDoc.
- [ ] **[P2]** Add version-check CI: block PR if published package version isn't bumped when its src changed.

## 12. Infrastructure — Helm, Terraform, Docker

- [x] **[P0]** `infrastructure/helm/workers/templates/deployment.yaml:33-58` — No `livenessProbe` / `readinessProbe`. Hung workers won't restart. Add HTTP probes once `/healthz` exists. — **FIXED 2026-08-27: liveness on /healthz and readiness on /readyz, against a new health port exposed by the worker**
- [x] **[P0]** `Dockerfile.workers:33-34` — Healthcheck is `node -e "process.exit(0)"` (always passes). Point at real `/healthz`. — **FIXED 2026-08-27: the worker now serves /healthz and /readyz (it had no HTTP server, so there was nothing to point at) and the healthcheck queries it**
- [ ] **[P1]** `Dockerfile.workers:36` — Runs `ts-node` in production. Pre-compile in a build stage; run compiled JS.
- [ ] **[P1]** `infrastructure/helm/` — No `NetworkPolicy` manifests. Calico is enabled but everything can talk to everything. Add deny-all + explicit allow rules (workers→NATS+Mongo, API→Mongo+NATS+Redis).
- [ ] **[P1]** `infrastructure/helm/api/values.yaml:79-82` — Service account created but no minimal RBAC. Add `Role`/`RoleBinding` restricting to own namespace.
- [ ] **[P1]** `infrastructure/helm/nats/values.yaml` — Memory limit set but no CPU. Add requests/limits.
- [ ] **[P1]** `infrastructure/terraform/main.tf:155` — Network policy enabled but no Pod Security Standards enforced. Turn on `azure_policy_enabled` or admission controller for baseline PSS.
- [ ] **[P2]** All Helm secrets should route through Azure Key Vault + CSI driver; audit `values.yaml` for any secret in `configMap`.
- [ ] **[P2]** `Dockerfile.web:37` — Move `wget` install into final stage only; verify final image < 200 MB (CI warns).

## 13. CI/CD & Root Tooling

- [x] **[P0]** `.github/workflows/security-audit.yml:43-44` — `pnpm audit --prod` uses `continue-on-error: true`; HIGH vulns don't block. Change to fail on HIGH+. — **FIXED 2026-08-27, but NOT as written: failing on any HIGH would mean a permanently red build, since there are ~50 high-severity advisories in production dependencies today. The gate now fails on any CRITICAL and on any INCREASE in HIGH above a committed ceiling (.github/audit-baseline.json), so new ones are blocked while the backlog is visible and ratchets down. Clearing the backlog is dependency-upgrade work — axios, swagger-ui-react, @opentelemetry/sdk-node — and is still outstanding**
- [ ] **[P1]** Add GitHub CodeQL workflow for SAST (free, native).
- [ ] **[P1]** `.github/workflows/ci.yml` — No coverage gate. Run Jest with `--coverage`, fail if branch coverage < threshold.
- [ ] **[P1]** `.github/workflows/ci.yml:32` — Only `lint:web` runs. Add `pnpm lint` across all workspaces (API + workers + packages). Requires…
- [ ] **[P1]** Root `.eslintrc.json` + `.prettierrc` don't exist. Add shared config; wire `pnpm lint` and `pnpm format`.
- [ ] **[P1]** Add `husky` + `.husky/pre-commit` running `pnpm lint-staged` (typecheck + lint changed files).
- [ ] **[P1]** Root `package.json` — CI calls `pnpm typecheck` but the script isn't defined at root. Add `"typecheck": "tsc -p tsconfig.base.json --noEmit"`.
- [ ] **[P2]** Add integration test job for workers (`apps/workers/src/jobs/tests/billing.int.test.ts` never runs in CI).
- [ ] **[P2]** Add Trivy container-image scan step for the built API/web/workers images.

## 14. Web — Auth, Middleware, Session

- [ ] **[P1]** `apps/web/src/lib/api.ts:72-104` — After 401 refresh, `authStore` isn't updated with the new token. Call `setToken(refreshedToken)` immediately.
- [ ] **[P1]** `apps/web/src/app/providers.tsx:23-27` — `/me` call gated by presence of `tc_role` cookie. Role cookie can survive JWT expiry. Always call `/me` on load; branch on result.
- [ ] **[P1]** `apps/web/src/app/providers.tsx:44-59` — Periodic session check can race with in-flight refresh from `api.ts`. Guard with a single-flight promise.
- [ ] **[P1]** `apps/web/middleware.ts:40-43` — Unauth `/admin` redirects to `/?m=forbidden` (public page). Redirect to dedicated `/403`.
- [ ] **[P2]** `apps/web/middleware.ts:19-33` — Subdomain rewrites bypass session validation. Verify widget token server-side inside rewritten route.
- [ ] **[P2]** Add "session expiring in 60 s" modal with "Stay signed in" action.

## 15. Web — Layout, Nav, Empty States

- [ ] **[P1]** `apps/web/src/app/layout.tsx` — Missing `lang="en"` on `<html>`. Add.
- [ ] **[P2]** `apps/web/src/app/(console)/layout.tsx:97` — Skip-to-content link uses `.sr-only.focus:not-sr-only` but blends with sidebar. Add `focus:z-50 focus:ring-4 focus:bg-white`.
- [ ] **[P2]** `apps/web/src/app/(console)/customers/page.tsx:88` — Empty state is a single line. Add icon + CTA ("No customers yet · [+ New Customer]").
- [ ] **[P2]** `apps/web/src/app/(console)/tickets/[id]/page.tsx:95` — Silent empty attachment section. Show "No attachments · [+ Add]".
- [ ] **[P2]** Mobile sidebar closes immediately after tap. Keep open 250 ms to signal navigation.

## 16. Web — Client Data Fetching & State

- [ ] **[P1]** `apps/web/src/hooks/useApi.ts:104-110` — Staff picker fires deduped-per-page instead of app-wide. Set `staleTime: 60_000` on `/users`.
- [ ] **[P1]** `apps/web/src/app/(console)/tickets/[id]/page.tsx` — Potential N+1 loading attachments per comment. Have API return nested attachments in one call.
- [ ] **[P2]** Wrap `(console)` layout in `QueryErrorResetBoundary` so query errors don't blank the screen.
- [ ] **[P2]** Verify `React Query` cache/stale times match tenancy — invalidate all queries on tenant switch.

## 17. Web — Accessibility (a11y)

- [ ] **[P1]** `apps/web/src/components/ui/Modal.tsx` — Body scroll not locked when modal open. Add `document.body.style.overflow = 'hidden'` on open, restore on close.
- [ ] **[P1]** `apps/web/src/components/ui/ConfirmDialog.tsx:23-32` — No focus trap. Wrap content in `focus-trap-react` (or migrate to Headless UI `Dialog`).
- [ ] **[P1]** `apps/web/src/components/ui/ConfirmDialog.tsx:37` — Destructive variant should use `role="alertdialog"`.
- [ ] **[P1]** `apps/web/src/components/ui/Modal.tsx:15` — Backdrop is an empty `<button aria-label="Close">` with no visible label. Add visible close button in header.
- [ ] **[P1]** `apps/web/src/app/(console)/customers/page.tsx:40-45` — Search input has `aria-label` only, no `<label>`. Add visually-hidden `<label htmlFor>`.
- [ ] **[P2]** Toast `aria-live="polite"` dismiss unnoticed by screen readers. Add explicit dismiss announcement or rely on live region updates.
- [ ] **[P2]** Run axe-core in CI (via `axe-playwright`) and fail build on any Serious/Critical violation.
- [ ] **[P2]** Verify focus ring contrast (3:1) in both light + dark themes across all buttons.

## 18. Web — Performance

- [ ] **[P2]** `apps/web/src/components/editor/RichTextEditor.tsx:9-23` — Loads all highlight.js languages upfront. Lazy-load per language.
- [ ] **[P2]** `apps/web/src/app/admin/*` — Import heavy chart/analytics components with `next/dynamic({ ssr: false })`.
- [ ] **[P2]** Audit `next build` output for chunks > 250 KB; split.
- [ ] **[P3]** Add `@next/bundle-analyzer` script + CI comment on bundle diff per PR.

---

## 19. UI Enhancements

**Goal:** Modernize form interactions with consistent, accessible, lightweight primitives. Every item below must ship with Playwright coverage (see Section 21).

### 19.1 Calendars & Date Pickers

- [ ] **[P1]** Add a lightweight date-picker library. **Pick:** `react-day-picker` (~10 KB gzipped, headless, keyboard-accessible, RTL support). Alternative: `@rehookify/datepicker` (smaller, hook-based).
  - Rationale: Avoid heavy competitors (`react-datepicker` ~50 KB, `MUI DatePicker` ~200 KB with deps).
- [ ] **[P1]** Build shared `<DatePicker />` and `<DateRangePicker />` wrappers in `apps/web/src/components/forms/`. Props: `value`, `onChange`, `min`, `max`, `disabledDays`, `locale`, `error`, `label`.
- [ ] **[P1]** Replace every native `<input type="date">` (grep confirmed none present today — add pickers to pages that need them):
  - Tickets list: date-range filter (Created between, Updated between).
  - Customers list: created-between filter.
  - Analytics: report date range picker.
  - Admin audit log: from/to date range.
  - Admin errors log: from/to date range.
  - Billing invoices: period picker.
- [ ] **[P1]** Add a `<Calendar />` month/week/day view for scheduling (used later by follow-ups / SLA due-dates).
- [ ] **[P2]** Support keyboard nav (arrow keys within month, PageUp/PageDown for month, Shift+PageUp/Down for year).
- [ ] **[P2]** Localize month/day names via `Intl.DateTimeFormat`; support user's tenant timezone.
- [ ] **[P2]** Render in a portal to avoid clipping inside overflow-hidden containers.

### 19.2 Select Inputs → Search-Select (Combobox) Conversion

- [ ] **[P1]** Adopt a headless combobox library. **Pick:** `@headlessui/react` `Combobox` (already commonly paired with Tailwind, matches existing UI style). Alternative: `downshift` (more flexible, larger footprint).
- [ ] **[P1]** Build shared `<SearchSelect />` and `<SearchMultiSelect />` in `apps/web/src/components/forms/`. Props: `options`, `value`, `onChange`, `label`, `placeholder`, `renderOption`, `getOptionLabel`, `filter`, `loading`, `error`, `emptyMessage`, `virtualized` (bool for > 200 options).
- [ ] **[P1]** Convert these `<select>` instances (native today) to `SearchSelect` — grep found NO `<select>` in web today, but the following pickers currently use custom dropdowns / native and MUST switch:
  - Assignee picker (Ticket detail, Ticket list bulk assign).
  - Customer picker (create ticket manually, link comment).
  - Tag picker (Ticket, Customer) — multi-select.
  - Plan picker (admin/plans, subscription upgrade).
  - Tenant picker (admin cross-tenant switcher).
  - Country picker (customer profile) — ~250 options, must virtualize.
  - Timezone picker (user profile, tenant settings) — ~400 options, must virtualize.
  - Language/locale picker (settings).
  - Role picker (admin/users) with descriptions.
  - API-key scope picker — multi-select with grouping.
  - Webhook event picker — multi-select with grouping.
- [ ] **[P1]** Add "Create new…" action inside SearchSelect when appropriate (e.g., tag picker allows inline tag creation).
- [ ] **[P2]** Async option loading with 250 ms debounce + cancel-on-remount.
- [ ] **[P2]** Show recently used options at top of dropdown (per-user localStorage).
- [ ] **[P2]** Keyboard: type-ahead, Arrow navigation, Enter selects, Escape closes, Backspace on empty removes last tag in multi-select.
- [ ] **[P2]** Announce selection changes via `aria-live` region.

### 19.3 Input Improvements

- [ ] **[P1]** Standardize on a `<FormField>` wrapper (`apps/web/src/components/forms/`) that owns: label, required marker, helper text, error text, `aria-describedby` wiring, and consistent spacing. Replace ad-hoc label+input pairs.
- [ ] **[P1]** Every interactive input gets `min-h-[44px]` for tap target compliance (WCAG 2.5.5).
- [ ] **[P1]** Add character counter inside `RichTextField` / long textareas; warning styling at 80% of limit; block-with-message at 100%.
- [ ] **[P1]** Rich text editor placeholder — replace `::before` CSS trick (`apps/web/src/components/editor/RichTextField.tsx:74`) with a visible overlay that hides on focus/input.
- [ ] **[P1]** Number inputs (e.g., `apps/web/src/app/admin/plans/page.tsx`) — add helper text, min/max enforced by `<input type="number">` attrs AND Zod client-side, plus screen-reader hint.
- [ ] **[P1]** Prevent double-submit: disable form (`fieldset[disabled]`) not just button while a mutation is in flight (`apps/web/src/app/(console)/settings/email/page.tsx:61-63`).
- [ ] **[P1]** Add auto-save-draft for long-form fields (ticket reply, comment) to `localStorage` keyed by (ticketId, userId); restore on mount.
- [ ] **[P2]** Input masks: phone, currency, date-of-birth (via `react-imask` or hand-rolled).
- [ ] **[P2]** Paste normalization: rich-text paste should strip Word/Google Docs junk styles.
- [ ] **[P2]** File input: drag-and-drop overlay + progress + cancel + retry (already exists partially — audit and consolidate).

### 19.4 Icons Representation Structure

- [ ] **[P1]** Confirmed single library in use: `lucide-react`. Codify with a lint rule (`no-restricted-imports`) blocking `@heroicons/*`, `react-icons/*`, inline SVGs.
- [ ] **[P1]** Create `apps/web/src/components/ui/Icon.tsx` — a thin wrapper providing consistent size scale (`xs=12, sm=16, md=20, lg=24, xl=32`), stroke width, and `aria-hidden` by default. Decorative icons: `aria-hidden="true"`. Meaningful icons: require `aria-label`.
- [ ] **[P1]** Semantic icon aliases file (`iconMap.ts`): map domain concepts → lucide icons (e.g., `TicketIcon = LifeBuoy`, `CustomerIcon = User`, `AssignIcon = UserPlus`). One place to swap.
- [ ] **[P2]** Tree-shake verification: import from `lucide-react` (not `lucide-react/icons/*`) — the former is properly tree-shakeable in Next 14+.
- [ ] **[P2]** Loading state icons (`Loader2` spinner) should use `animate-spin` uniformly (never bespoke keyframes).
- [ ] **[P2]** Status pill icons: success = `CheckCircle2`, error = `XCircle`, warn = `AlertTriangle`, info = `Info`. Codify.

### 19.5 Spinners, Loaders & Skeletons

- [ ] **[P1]** Consolidate three loader components (`Loader.tsx`, `Skeleton.tsx`, inline `<Loader2 className="animate-spin">`) into a single `apps/web/src/components/ui/loading/` folder with:
  - `<Spinner size={} label={} />` — indeterminate spinner, always requires accessible label (visually hidden if you don't want text).
  - `<PageLoader />` — full-viewport, uses `role="status" aria-busy="true"`.
  - `<InlineLoader />` — in-line replacement for text.
  - `<Skeleton variant="text|rect|circle" width height />` — for shell loading.
  - `<ProgressBar value max label />` — determinate.
- [ ] **[P1]** Every mutation button shows a spinner inside the button with the label pattern "verb+ing" ("Saving…", "Sending…", "Uploading…"). Never a bare spinner.
- [ ] **[P1]** Skeleton screens on: Ticket list, Ticket detail, Customer list, Customer detail, Settings/branding, Admin dashboard, Billing page. Match layout to reduce CLS.
- [ ] **[P1]** `AuthGuard` (`apps/web/src/components/guards/AuthGuard.tsx:20`) — add "Taking longer than expected…" after 3 s; "Reload" button after 10 s.
- [ ] **[P2]** Debounce spinners: don't show for requests < 150 ms (avoids flash).
- [ ] **[P2]** For network banner: distinguish "reconnecting…" vs "offline" and show queued action count.
- [ ] **[P2]** Suspense boundaries around every async route segment; suspense fallback = matching skeleton.

### 19.6 Toasts, Modals, Dialogs, Tooltips

- [ ] **[P1]** Consolidate on Headless UI `Dialog` for Modal + ConfirmDialog to inherit focus trap + a11y for free.
- [ ] **[P1]** `Toast` — auto-dismiss should pause on hover/focus (WCAG 2.2.1 timing adjustable).
- [ ] **[P2]** Add `<Tooltip>` primitive (Radix or Headless UI) with `role="tooltip"`, delay open 300 ms, hides on Escape.
- [ ] **[P2]** Add `<Popover>` primitive for menus/action sheets to replace ad-hoc dropdowns.

### 19.7 Forms Library Alignment

- [ ] **[P2]** Pick one form library (recommend `react-hook-form` + `zod` resolver — some code already uses it). Migrate the rest incrementally.
- [ ] **[P2]** Share Zod schemas between API validation and web validation via `packages/types` (or `packages/schemas`) — single source of truth.

---

## 20. Chat Widget Embed Script

**File:** `packages/widget/src/index.ts` (208 lines).
**Serves:** to end-user browsers on customer websites via `<script src="…/widget/v1/tres-widget.min.js" data-tenant data-token>`.
**Backend counterpart:** `apps/api/src/routes/public.widget.ts`.

### 20.1 Critical Bugs (P0)

- [x] **[P0]** **No submit handler.** `getPanelHTML` renders `<form … onsubmit="return false;">` and there is no `addEventListener('submit', …)` wiring the form to `apiBase`. The widget accepts input but never creates a ticket. Add an async submit handler that POSTs to `${apiBase}/public/widget/tickets` with tenant+token and shows success/error UI. — **FIXED 2026-08-28: a real submit handler POSTs to /public/widget/tickets, shows the ticket reference on success, and surfaces failures (including a plain-language message for the 429 from the per-token budget) instead of failing silently**
- [x] **[P0]** **`DEFAULT_API_BASE = "http://localhost:4000"`** ships in the built artifact. Any customer embedding this without `data-api-base` will silently target localhost. Replace with production default and make it a build-time replacement (`import.meta.env.WIDGET_API_BASE`) enforced in CI. — **FIXED 2026-08-28: defaults to the production API and is overridable at build time via a __TRES_API_BASE__ define, or per-embed via data-api-base**
- [x] **[P0]** **Inline `onclick=` handler** at line 123 (`this.getRootNode().host.querySelector('.tres-fab').click()`). Inline handlers break CSP `script-src 'self'`. Replace with `addEventListener('click', …)` bound at mount. — **FIXED 2026-08-28: bound with addEventListener at mount. The form's onsubmit="return false;" is gone too — same CSP problem. A test asserts the rendered markup carries no on*= attributes at all**
- [ ] **[P0]** No CSRF/nonce/replay protection on widget submissions. Since the token is public, at minimum: server-side rate-limit per token+IP; add optional invisible CAPTCHA (Turnstile) toggle in widget config. — **PARTIAL 2026-08-27/28: the server-side half is done — widgetTicketLimiter caps tickets at 5/hour per widget token and widgetTokenLimiter caps overall widget traffic at 1000/hour per token. Not done: keying the throttle on token+IP jointly, and the optional Turnstile toggle. Both remain open**
- [x] **[P0]** No autoinit safety check — calling `init()` twice creates two widgets. Guard `mount` with `if (document.getElementById('tres-crm-widget')) return`. — **FIXED 2026-08-28: init() and mount() both bail if the host element already exists, so autoInit plus a manual init yields one widget. destroy() now also detaches the document keydown listener, which previously outlived the widget**

### 20.2 Security Hardening (P1)

- [ ] **[P1]** All dynamic content is inserted via `innerHTML` (`getPanelHTML`, FAB SVG). `escapeHtml` covers the greeting only. Rebuild the panel with `document.createElement` + `textContent` (safer XSS posture in the shadow DOM) OR wrap every interpolation with `escapeHtml`.
- [ ] **[P1]** `accentColor` (`config.accentColor`) is interpolated directly into CSS (`style.textContent`). Validate against `/^#[0-9a-fA-F]{3,8}$|^rgb/`, reject arbitrary CSS (avoid CSS injection breaking layout / phishing).
- [ ] **[P1]** `position` param cast with `as any` (line 198). Whitelist strictly: `["bottom-right", "bottom-left"]`.
- [ ] **[P1]** Fetch calls must set `credentials: 'omit'`, `mode: 'cors'`, and NEVER send cookies (widget is cross-origin; cookies would be tenant's).
- [ ] **[P1]** Backend `public.widget.ts` — fix domain-suffix bypass (see Section 5, item 1). This is co-required.
- [ ] **[P1]** Backend must validate the `Origin` header against the token's allowed domains on every request (already partial — audit for gaps).
- [ ] **[P1]** Add SRI (Subresource Integrity) hash guidance in embed docs; generate hash per release.
- [ ] **[P1]** Publish widget under a versioned URL (`/widget/v1/…`) — never mutate v1; new fields require v2.

### 20.3 Accessibility (P1)

- [ ] **[P1]** Panel opens without moving focus. On open, focus the first form field; on close, restore focus to the FAB.
- [ ] **[P1]** Focus trap inside the panel while open (Tab/Shift+Tab must not escape to page).
- [ ] **[P1]** Escape key handler at line 90 is attached to `document` globally — leaks after `destroy()`. Store the handler ref and remove it in `destroy()`.
- [ ] **[P1]** FAB should have `aria-expanded="false"` by default (currently set only on toggle).
- [ ] **[P1]** Announce submission result via `aria-live="polite"` inside the panel (confirmation `role="alert"` is fine for errors; use `role="status"` for success too).
- [ ] **[P2]** Verify FAB contrast — brand `accentColor` may be too light for AA. Auto-compute a darker text color if the accent contrast against white < 4.5:1.
- [ ] **[P2]** `prefers-reduced-motion` respected for FAB hover (good) — extend to panel open transition when added.

### 20.4 Robustness / UX (P1)

- [ ] **[P1]** Handle network failure: show retry UI, don't disable form permanently.
- [ ] **[P1]** Show loading state on submit button ("Sending…", disabled).
- [ ] **[P1]** File attachments — currently absent. Add opt-in file input (PNG/JPEG/PDF, ≤10 MB — matches server per user memory `reference_ticket_attachments.md`).
- [ ] **[P1]** Preserve draft in `sessionStorage` scoped by widget instance so an accidental refresh doesn't lose the message.
- [ ] **[P1]** Detect ad-blocker or CSP block; log to console once with a friendly message.
- [ ] **[P2]** Support unread reply badge: poll `${apiBase}/public/widget/unread` every 60 s if a ticket has been submitted this session.
- [ ] **[P2]** Support conversational (chat) mode in addition to form mode — configurable via `data-mode="chat"`.
- [ ] **[P2]** Support offline queueing: if fetch fails, buffer in IndexedDB, replay on next `online` event.
- [ ] **[P2]** Emit analytics events (`open`, `submit_start`, `submit_success`, `submit_error`) to a `window.postMessage` bus so parent site can listen.

### 20.5 Build & Distribution (P1)

- [ ] **[P1]** Ship both `tres-widget.min.js` (IIFE) and `tres-widget.esm.js`. Sizes budget: < 15 KB gzipped for IIFE.
- [ ] **[P1]** Serve from CDN with immutable cache (`Cache-Control: max-age=31536000, immutable`) using content-hashed filenames; keep `/widget/v1/latest.js` as a stable redirect.
- [ ] **[P1]** Produce sourcemaps; upload to Sentry per release for stack-trace symbolication.
- [ ] **[P1]** Add build size check to CI; fail if `> 20 KB gzipped`.
- [ ] **[P1]** Add `packages/widget/CHANGELOG.md` + semver enforcement.
- [ ] **[P2]** Publish to npm as `@tres-crm/widget` alongside CDN for React-native / bundler consumers.

### 20.6 Testing (P0 — see Section 21 for Playwright details)

- [x] **[P0]** Unit tests for `escapeHtml`, autoInit, `init` idempotency, `destroy` cleanup. — **FIXED 2026-08-28: 50 tests covering escaping, colour validation, init idempotency, destroy cleanup, open/close and aria state, submit success/error/429/network paths, autoInit, and the absence of inline handlers. jest-environment-jsdom added; the widget package is now in the jest roots and the coverage denominator**
- [x] **[P0]** Playwright cross-browser E2E: Chromium, Firefox, WebKit (Safari) → submit form on a test host page. — **FIXED 2026-08-29: Playwright harness added (playwright.config.ts, a self-serving host page, a token-keyed API stub). 15 specs run on all three engines — 45 runs, all green locally. The suite drives the BUILT bundle, not the source, and needs no database or API process**
- [x] **[P0]** Playwright test that the widget respects a strict `Content-Security-Policy: script-src 'self' <widget-origin>; style-src 'self' 'unsafe-inline'` on the host page. — **FIXED 2026-08-29: the fixture serves /csp under `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'`. Four specs assert the widget mounts, the launcher and close control work, the form submits, and no violation or page error is raised — the regression that would otherwise reach customers as a dead button**
- [ ] **[P1]** Cross-origin test: host page on `example.com`, widget served from `widget.trescrm.com` — assert no CORS/cookie leaks.
- [ ] **[P1]** Shadow-DOM isolation test — host page global CSS must not affect widget styles.
- [ ] **[P1]** Accessibility audit with `axe-playwright` inside the shadow root.
- [ ] **[P1]** Rate-limit test — 6 submissions from the same IP with the same token → 6th returns 429.

---

## 21. Playwright E2E Coverage

**Current state:** No Playwright config or tests in `apps/web/tests/` (directory doesn't exist). Only unit test `apps/web/src/lib/publicApi.test.ts` exists.

### 21.1 Bootstrap (P0)

- [ ] **[P0]** Install: `pnpm -F @tres-crm/web add -D @playwright/test axe-playwright`
- [ ] **[P0]** `apps/web/playwright.config.ts` — 3 projects (chromium, firefox, webkit), retry 1 on CI, screenshot on failure, video on retry, trace on first-retry.
- [ ] **[P0]** `apps/web/tests/fixtures/` — helper for logging in as (owner|admin|agent|readonly) via API + cookie injection; per-worker seeded tenant.
- [ ] **[P0]** CI job that spins up API (in-memory Mongo via `mongodb-memory-server`), web dev server, and runs the suite. Cache Playwright browsers.
- [ ] **[P0]** Fail build on any test failure or axe violation of severity ≥ Serious.

### 21.2 Core Flows (P0)

- [ ] **[P0]** `auth.spec.ts` — sign up new tenant, sign in, sign out, forgot-password, MFA challenge.
- [ ] **[P0]** `tickets.spec.ts` — create ticket, list filter, assign, add comment (internal + public), close, reopen, delete.
- [ ] **[P0]** `customers.spec.ts` — CRUD + search + tag.
- [ ] **[P0]** `billing.spec.ts` — view plan, start upgrade → Paystack redirect (mocked), verify success flow.
- [ ] **[P0]** `admin.spec.ts` — impersonate tenant, view audit log, cross-tenant RBAC deny cases.

### 21.3 UI-Enhancement Specific Suites (P1)

Every UI enhancement from Section 19 gets a matching spec file. Assertions include: keyboard-only interaction, mouse interaction, screen-reader tree via `getByRole`, and an `axe.run()` at the end.

- [ ] **[P1]** `ui/date-picker.spec.ts` — open picker, type date, keyboard-nav (Arrow/Page/Home), disabled dates blocked, range picker start-end order, locale (en, es, fr), timezone correctness.
- [ ] **[P1]** `ui/search-select.spec.ts` — open, type-ahead filter, keyboard select, mouse select, multi-select add/remove, chip removal via Backspace, virtualized list scrolls smoothly, async loading spinner appears.
- [ ] **[P1]** `ui/form-field.spec.ts` — required marker announced, helper text linked, error text linked to input via `aria-describedby`, submit disables entire fieldset.
- [ ] **[P1]** `ui/rich-text.spec.ts` — placeholder visible, char counter updates, 80% warning appears, paste from Word strips styles, keyboard shortcuts (Ctrl+B/I).
- [ ] **[P1]** `ui/icons.spec.ts` — decorative icons carry `aria-hidden`, meaningful icons carry `aria-label`, all icons come from `lucide-react`.
- [ ] **[P1]** `ui/loaders.spec.ts` — button spinner appears on click, disappears on response, skeleton screens visible before data arrives, no CLS from skeleton→content swap (assert `page.evaluate(() => performance.getEntriesByType('layout-shift'))`).
- [ ] **[P1]** `ui/modal.spec.ts` — opens with focus in dialog, focus trapped, Escape closes, body scroll locked, backdrop click closes, focus restored to trigger.
- [ ] **[P1]** `ui/toast.spec.ts` — announced by SR, pauses on hover, dismissable via keyboard.

### 21.4 Widget Embed Suites (P0/P1)

Test host pages under `apps/web/tests/widget-hosts/` — plain HTML files served over HTTP that embed the built widget from `packages/widget/dist/`.

- [ ] **[P0]** `widget/embed-basic.spec.ts` — script tag auto-init, FAB appears, click opens panel.
- [ ] **[P0]** `widget/submit.spec.ts` — fill form, submit, confirmation appears, network request goes to correct API base with correct token.
- [ ] **[P0]** `widget/csp.spec.ts` — host page ships strict CSP; widget still functions; no inline handlers rejected.
- [ ] **[P0]** `widget/isolation.spec.ts` — host page has aggressive global CSS (`* { color: red !important }`); widget internals unaffected.
- [ ] **[P1]** `widget/a11y.spec.ts` — axe-scan against the shadow root; focus trap; Escape closes; focus restored to FAB.
- [ ] **[P1]** `widget/rate-limit.spec.ts` — spam 6 submissions → 429 returned; UI shows a friendly retry message.
- [ ] **[P1]** `widget/cross-browser.spec.ts` — run on chromium+firefox+webkit; assert same DOM structure and successful submit.
- [ ] **[P1]** `widget/offline.spec.ts` — start offline, submit, come online → auto-retry succeeds.
- [ ] **[P1]** `widget/idempotent-init.spec.ts` — call `TresCRM.init()` twice → only one widget mounts.
- [ ] **[P1]** `widget/destroy-cleanup.spec.ts` — after `TresCRM.destroy()`, DOM node gone, `keydown` listener removed (verify `getEventListeners`).

### 21.5 Cross-Cutting

- [ ] **[P1]** Visual regression: Percy or Playwright screenshot diffs on key screens per PR.
- [ ] **[P1]** Perf budget: Lighthouse CI on preview URL; block PR if Perf < 85 or a11y < 95.
- [ ] **[P2]** Add `test:e2e:headed` script for local debug; document Playwright inspector usage in `apps/web/tests/README.md`.

---

## Priority Rollup

| Priority | Count | Notes |
|----------|-------|-------|
| P0 | ~35  | Release-blocking security, correctness, tenant-isolation, widget submit-handler |
| P1 | ~90  | GA-blocking hardening, a11y, UI standardization, test coverage |
| P2 | ~55  | Quarterly polish, perf, developer ergonomics |
| P3 | 2    | Long-tail nice-to-haves |

## Suggested Sequencing

1. **Week 1 — P0 security & correctness sweep:** Sections 1, 2, 4, 5, 6, 20.1 (widget submit + localhost default), plus CI SAST + audit gating.
2. **Week 2 — P0 test scaffolding:** Section 21.1 + 21.2, tenant-isolation integration tests, worker DLQ + lock.
3. **Week 3–4 — UI enhancement foundations:** Section 19.1–19.5 primitives (DatePicker, SearchSelect, FormField, Icon, Loader consolidation) + matching Playwright suites (21.3).
4. **Week 5 — Widget hardening + full test matrix:** Section 20.2–20.6 + 21.4.
5. **Week 6+ — Observability, perf, a11y polish:** Sections 8, 17, 18.
