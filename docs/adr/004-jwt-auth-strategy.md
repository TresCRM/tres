# ADR 004: JWT Auth with Separate Access/Refresh Tokens

## Status
Accepted

## Context
Need stateless authentication that supports session management and token revocation.

## Decision
- Short-lived access tokens (15min) signed with JWT_ACCESS_SECRET
- Long-lived refresh tokens (14d) signed with JWT_REFRESH_SECRET, stored as SHA-256 hashes in RefreshToken collection
- httpOnly cookies for token transport + Authorization header support
- Separate secrets allow independent rotation

## Consequences
- Refresh tokens are revocable (stored in DB)
- Session list/revoke endpoints possible
- Access tokens are stateless (no DB lookup on every request)
- Must handle token refresh in frontend interceptors
