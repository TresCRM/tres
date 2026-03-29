# Authentication Guide

## Overview
TRES CRM uses JWT (JSON Web Tokens) for authentication with separate access and refresh tokens.

## Auth Flow

1. **Signup**: `POST /api/v1/auth/signup` -- creates tenant + owner user (PENDING status)
2. **Verify Email**: `POST /api/v1/auth/verify` -- activates user account
3. **Login**: `POST /api/v1/auth/login` -- returns access token (15m) + refresh token (14d)
4. **Refresh**: `POST /api/v1/auth/refresh` -- exchange refresh token for new access token
5. **Logout**: `POST /api/v1/auth/logout` -- revokes refresh token

## Token Types

| Token | TTL | Secret | Use |
|-------|-----|--------|-----|
| Access Token | 15 min | JWT_ACCESS_SECRET | `Authorization: Bearer <token>` |
| Refresh Token | 14 days | JWT_REFRESH_SECRET | Stored in DB, httpOnly cookie |
| API Key | Configurable | SHA-256 hash | `X-API-Key: <key>` |
| Widget Token | 7 days | JWT_SECRET | Query param on widget endpoints |
| Customer Tracking | 7 days | JWT_SECRET | Query param on public endpoints |

## JWT Payload
```json
{ "sub": "<userId>", "tid": "<tenantId>", "roles": ["OWNER"] }
```

## Security Features
- Refresh tokens stored as SHA-256 hashes in DB (revocable)
- Account lockout after 10 failed login attempts (30 min)
- Password complexity: min 8 chars, uppercase, lowercase, digit
- Session management: list, revoke individual, revoke all
- CSRF protection via double-submit cookie on cookie-based requests
