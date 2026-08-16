# OWASP Top 10 Security Checklist

## A01 Broken Access Control
- [x] RBAC enforced on every endpoint (requireAuth + requirePermission)
- [x] Tenant isolation: every query includes tenantId filter
- [x] Custom roles resolve via union of canonical + custom permissions

## A02 Cryptographic Failures
- [x] Argon2 password hashing
- [x] JWT with configurable secret (enforced non-default in production)
- [x] API keys stored as SHA-256 hashes

## A03 Injection
- [x] Zod validation on all inputs
- [x] Mongoose parameterized queries (no raw string interpolation)
- [x] HTML sanitization via sanitizeUserHtml()
- [x] ReDoS protection via escapeRegex()

## A04 Insecure Design
- [x] MFA enforcement for privileged roles
- [x] Account lockout after 10 failed attempts
- [x] Password expiry enforcement
- [x] CSRF double-submit cookie

## A05 Security Misconfiguration
- [x] Helmet security headers
- [x] CORS origin allowlist
- [x] Error messages don't leak internals in production
- [x] Rate limiting on auth + public endpoints

## A06 Vulnerable Components
- [x] Dependabot weekly scans
- [x] npm audit in CI pipeline
- [x] Security audit workflow (daily)

## A07 Identity/Auth Failures
- [x] Brute force protection (rate limiting + lockout)
- [x] JWT refresh rotation
- [x] Session revocation (single + all)
- [x] SSO support (Google, Microsoft)

## A08 Data Integrity
- [x] Webhook HMAC-SHA256 signing
- [x] CSRF protection on state-changing requests
- [x] Input sanitization

## A09 Logging/Monitoring
- [x] Audit trail (ActivityLog)
- [x] Security event logging
- [x] Prometheus metrics
- [x] Sentry error tracking

## A10 SSRF
- [x] No user-controlled URLs fetched server-side without validation
- [x] Webhook delivery has 10s timeout
