# TRES CRM

> Multi-tenant SaaS helpdesk and CRM platform with ticketing, billing, surveys, real-time collaboration, and embeddable widget.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-244%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-ISC-lightgrey)]()

## Overview

TRES CRM is a production-grade, multi-tenant customer support system built as a pnpm monorepo. It provides:

- **Ticket Management** -- create, assign, reply, close, reopen with SLA tracking
- **Subscription Billing** -- 8 plans (FREE to Enterprise), prepay discounts, dunning
- **Survey Automation** -- CSAT/NPS surveys triggered on ticket close
- **Real-time Collaboration** -- WebSocket presence and ticket notifications
- **External API** -- API key auth with scoped permissions for third-party integrations
- **Embeddable Widget** -- drop-in JavaScript widget for customer ticket submission
- **White-label Branding** -- tenant-specific logo, colors, templates

## Architecture

```
tres-crm/
  apps/
    api/          Express.js 5 REST API (MongoDB, NATS, WebSocket)
    web/          Next.js 15 frontend (React 19, Tailwind CSS 4)
    workers/      Background billing & event processing
  packages/
    types/        Shared roles, permissions, event schemas
    widget/       Embeddable support widget (Shadow DOM)
    config/       (placeholder)
    sdk/          (placeholder)
    ui/           (placeholder)
```

**Data flow**: Client -> API -> MongoDB | API -> NATS -> Workers | API -> WebSocket -> Client

## Tech Stack

| Layer       | Technology                                     |
|-------------|------------------------------------------------|
| API         | Express 5, Mongoose 8, Zod, Pino               |
| Auth        | JWT (access 15m + refresh 14d), Argon2          |
| Database    | MongoDB 7 (Docker), mongodb-memory-server       |
| Events      | NATS 2, Node EventEmitter                       |
| Real-time   | Native `ws` WebSocket                           |
| Email       | Nodemailer + MailHog (dev)                       |
| Frontend    | Next.js 15 (App Router), TanStack Query, Zustand|
| Widget      | Vanilla TS, Shadow DOM, IIFE bundle              |
| Testing     | Jest (API), Vitest + Playwright (Web)            |
| Containers  | Docker Compose (Mongo, NATS, MailHog)            |

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 10+, Docker

# 1. Install dependencies
pnpm install

# 2. Copy environment config
cp .env.example .env

# 3. Start infrastructure
docker compose up -d

# 4. Seed demo data
pnpm seed:demo

# 5. Run API + Web
pnpm dev:api    # http://localhost:4000 (API + Swagger at /docs)
pnpm dev:web    # http://localhost:3000 (Frontend)
```

## Project Structure

```
apps/api/src/
  auth/           Cookie configuration
  billing/        Plan catalog, pricing logic
  config/         Centralized environment config
  constants/      Error codes
  db/             MongoDB connection
  docs/           OpenAPI/Swagger generation
  events/         Event emitter + handlers
  middlewares/     Auth, RBAC, CSRF, rate limiting, audit, subscription guard
  models/         Mongoose schemas (15+ models)
  realtime/       WebSocket presence + ticket notifications
  routes/         REST endpoints (auth, tickets, customers, users, etc.)
  services/       Mailer, storage, scanner, webhook dispatcher
  types/          TypeScript interfaces (AuthRequest, etc.)
  utils/          Auth helpers, sanitization, logging
  workers/        Billing worker

apps/web/src/
  app/            Next.js App Router pages
  components/     Reusable UI components

packages/types/src/
  roles.ts        7 roles, 22 permissions, hierarchy, matrix
  events.ts       Event Zod schemas

packages/widget/src/
  index.ts        Embeddable widget (Shadow DOM, FAB, form)
```

## Configuration

All environment variables are documented in `.env.example`. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/trescrm` |
| `JWT_SECRET` | Primary JWT signing secret | (required) |
| `JWT_ACCESS_SECRET` | Access token secret (falls back to JWT_SECRET) | JWT_SECRET |
| `JWT_REFRESH_SECRET` | Refresh token secret (falls back to JWT_SECRET) | JWT_SECRET |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost:3000,http://localhost:4000` |
| `SMTP_HOST` | SMTP server host | `localhost` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `FRONTEND_ORIGIN` | Frontend URL for email links | `http://localhost:3000` |

See `.env.example` for the complete list of 47+ variables.

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev:api` | Run API with hot reload (port 4000) |
| `pnpm dev:web` | Run Next.js frontend (port 3000) |
| `pnpm dev:workers` | Run billing + event workers |
| `pnpm dev:all` | Run API + Web concurrently |
| `pnpm test` | Run all tests |
| `pnpm test:e2e` | Run E2E tests only |
| `pnpm test:mem` | Run tests with in-memory MongoDB |
| `pnpm coverage` | Run tests with coverage report |
| `pnpm seed:demo` | Seed demo tenant + subscription |
| `pnpm worker:billing` | Run billing worker once |

## Testing

```bash
# All tests (uses in-memory MongoDB)
npx cross-env EMAILS_DISABLED=1 DISABLE_RATE_LIMIT=1 USE_MEMORY_MONGO=1 \
  NODE_ENV=test JWT_SECRET=test-jwt-secret SURVEY_JWT_SECRET=test-survey-secret \
  MONGO_URI=mongodb://localhost:27017/test \
  npx jest --runInBand --no-coverage --silent

# Expected: 23 suites, 244 tests, all passing
```

**Test architecture**: Jest + ts-jest with mongodb-memory-server for isolated test databases. Each test suite creates its own tenant/user fixtures.

**Coverage targets**: 80% functions/lines/statements, 70% branches.

## API Overview

- **Swagger UI**: http://localhost:4000/docs
- **OpenAPI JSON**: http://localhost:4000/docs/openapi.json
- **Postman**: Import the OpenAPI JSON into Postman

### Key Endpoints

| Area | Endpoints | Auth |
|------|-----------|------|
| Auth | signup, verify, login, refresh, logout, sessions | Public / JWT |
| Tickets | CRUD, reply, assign, close, reopen, reassign | JWT + Permission |
| Customers | CRUD with search | JWT + Permission |
| Users | invite, list, roles, enable/disable | JWT + Permission |
| Subscriptions | manage, cancel, plans | JWT + Permission |
| Surveys | templates, send, responses, analytics | JWT + Permission |
| Settings | branding, widget token | JWT + Permission |
| API Keys | generate, list, update, revoke | JWT + Permission |
| External API | tickets + customers via API key | X-API-Key |
| Webhooks | register, list, update, delete, test | JWT + Permission |
| Add-ons | available, activate, list, cancel | JWT + Permission |
| Attachments | upload, list, get, delete | JWT + Permission |
| Widget | config, create ticket, track, reply | Widget token |
| Public | surveys, customer tickets | JWT magic link |

## Deployment

### Docker

```bash
# Build API image
docker build -t tres-crm-api .

# Run with environment
docker run -p 4000:4000 --env-file .env tres-crm-api
```

### Docker Compose (Development)

```bash
docker compose up -d   # MongoDB + NATS + MailHog
pnpm dev:api           # API server
pnpm dev:web           # Frontend
```

## Security

- Argon2 password hashing
- JWT with separate access/refresh secrets
- CSRF double-submit cookie protection
- HTML sanitization (sanitize-html) on all user input
- CORS locked to configured origins
- Tiered rate limiting (global 120/min, auth 10/min)
- Account lockout after 10 failed attempts
- WebSocket JWT authentication
- API key SHA-256 hash storage
- Webhook HMAC-SHA256 payload signing
- RBAC with 7 roles, 22 permissions, role hierarchy

## Contributing

1. Branch from `main`
2. Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
3. Ensure all tests pass: `pnpm test`
4. Submit PR with description

## License

ISC
