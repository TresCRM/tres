# TRES CRM API

Express.js 5 REST API with MongoDB, NATS event bus, and WebSocket support.

## Architecture

```
src/
  config/env.ts          Centralized environment configuration
  middlewares/
    auth.ts              JWT auth + role hierarchy + permission checks
    apiKeyAuth.ts        X-API-Key authentication + scope enforcement
    csrf.ts              Double-submit cookie CSRF
    security.ts          Tiered rate limiting (global/auth/strict)
    freeTierGuard.ts     Free plan ticket limit enforcement
    subscriptionGuard.ts Subscription status checks
    audit.ts             Request activity logging
  routes/
    auth.ts              Signup, login, sessions
    tickets.ts           Ticket CRUD + lifecycle
    customers.ts         Customer management
    users.ts             User/staff management
    subscriptions.ts     Billing + plans
    surveys.ts           Survey templates + analytics
    emails.ts            Email template management
    settings.ts          Branding settings
    apikeys.ts           API key management
    webhooks.ts          Webhook management
    addons.ts            Add-on management
    attachments.ts       File upload/management
    ext.ts               External API (API key auth)
    public.tickets.ts    Customer ticket submission
    public.surveys.ts    Public survey submission
    public.widget.ts     Widget endpoints
    widgetSettings.ts    Widget token management
  models/                15+ Mongoose models
  services/              Mailer, storage, scanner, webhook dispatcher
```

## Adding a New Route

1. Create `routes/myroute.ts` with Router
2. Add Zod schemas + OpenAPI registration
3. Use `requireAuth` + `requirePermission("MY_PERMISSION")` middleware
4. Type request as `(req as AuthRequest).auth` for tenant/user context
5. Mount in `routes/appRoutes.ts`
6. Write tests in `routes/tests/myroute.e2e.test.ts`

## Running Tests

```bash
npx cross-env EMAILS_DISABLED=1 DISABLE_RATE_LIMIT=1 USE_MEMORY_MONGO=1 \
  NODE_ENV=test JWT_SECRET=test-jwt-secret SURVEY_JWT_SECRET=test-survey-secret \
  MONGO_URI=mongodb://localhost:27017/test \
  npx jest --runInBand --no-coverage --silent
```
