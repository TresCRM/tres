# Error Handling

## Standard Error Format
```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": "Optional validation details"
}
```

## Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `unauthorized` | 401 | Missing or invalid auth token |
| `invalid_token` | 401 | Expired or malformed JWT |
| `api_key_required` | 401 | Missing X-API-Key header |
| `invalid_api_key` | 401 | API key not found or revoked |
| `forbidden` | 403 | Insufficient permissions |
| `insufficient_scope` | 403 | API key missing required scope |
| `ticket_limit_reached` | 403 | Free tier limit exceeded |
| `not_found` | 404 | Resource not found |
| `invalid_request` | 400 | Validation error (check details) |
| `invalid_status` | 400 | Invalid status transition |
| `csrf_invalid` | 403 | CSRF token mismatch |
| `customer_exists` | 409 | Duplicate customer email |
| `email_exists` | 409 | User email already in tenant |
| `tenant_slug_taken` | 409 | Tenant slug already exists |
| `seat_limit_reached` | 402 | Subscription seat limit exceeded |
| `subscription_required` | 402 | No active subscription |
| `subscription_expired` | 402 | Subscription expired |
| `account_locked` | 423 | Too many failed login attempts |
| `rate_limited` | 429 | Too many requests |
| `internal_error` | 500 | Server error |
