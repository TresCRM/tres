# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main) | Yes |
| Previous releases | Security patches only |

## Reporting a Vulnerability

If you discover a security vulnerability in TRES CRM, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email **security@trescrm.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested remediation
3. You will receive acknowledgment within **24 hours**
4. We will provide a detailed response within **72 hours**
5. We will coordinate disclosure timeline with you

## Security Measures

This application implements:
- MFA (TOTP) enforced for privileged roles
- Refresh token rotation with stolen-token detection
- AES-256-GCM field-level encryption for PII at rest
- Argon2 password and API key hashing
- RBAC with 7 roles, 29 permissions, tenant isolation
- CSRF protection with token rotation
- CSP with per-request nonces
- Structured security event logging (SIEM-ready)
- Automated dependency vulnerability scanning
- 90-day password expiry policy
- GDPR data export and right-to-erasure endpoints

## Security-Related Configuration

| Variable | Purpose |
|----------|---------|
| `FIELD_ENCRYPTION_KEY` | 64-char hex key for PII encryption at rest |
| `JWT_SECRET` | Primary JWT signing secret |
| `JWT_ACCESS_SECRET` | Access token signing (falls back to JWT_SECRET) |
| `JWT_REFRESH_SECRET` | Refresh token signing (falls back to JWT_SECRET) |
| `PASSWORD_MAX_AGE_DAYS` | Password expiry in days (default: 90) |
| `ACCOUNT_LOCKOUT_ATTEMPTS` | Failed logins before lockout (default: 10) |
