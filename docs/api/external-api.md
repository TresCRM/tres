# External API (API Key Authentication)

## Overview
The External API allows third-party systems to manage tickets and customers via API keys instead of JWT tokens.

## Getting an API Key
1. `POST /api/v1/api-keys` with JWT auth: `{ name, scopes, expiresInDays? }`
2. Save the returned key (shown once, stored as SHA-256 hash)

## Scopes
| Scope | Access |
|-------|--------|
| `tickets:read` | List and view tickets |
| `tickets:write` | Create, update, close, reopen tickets |
| `customers:read` | List and view customers |
| `customers:write` | Create and update customers |
| `staff:manage` | Manage users (future) |

## Authentication
```
X-API-Key: tcrm_abc123...
```

## Endpoints
All under `/api/v1/ext/`:

**Tickets**: POST `/tickets`, GET `/tickets`, GET `/tickets/:id`, PUT `/tickets/:id`, POST `/tickets/:id/comments`, POST `/tickets/:id/close`, POST `/tickets/:id/reopen`

**Customers**: POST `/customers` (upsert), GET `/customers`, GET `/customers/:id`, PUT `/customers/:id`

## Rate Limits
60 req/min per tenant, 120/min burst. Plans without `api: true` entitlement are rejected (403).
