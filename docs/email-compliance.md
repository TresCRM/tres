# Email Compliance & Deliverability Guide

## SPF/DKIM/DMARC Configuration

For tenants using custom email domains (`emailFrom` in branding settings), the following DNS records must be configured by the domain owner:

### SPF (Sender Policy Framework)
Add a TXT record to your domain:
```
v=spf1 include:_spf.trescrm.com ~all
```
Replace `_spf.trescrm.com` with your actual SMTP provider's SPF include.

### DKIM (DomainKeys Identified Mail)
Your SMTP provider generates a DKIM key pair. Add the public key as a TXT record:
```
selector._domainkey.yourdomain.com IN TXT "v=DKIM1; k=rsa; p=<public-key>"
```
The selector and key are provided by your email service (SendGrid, AWS SES, Mailgun, etc.).

### DMARC (Domain-based Message Authentication)
Add a TXT record for policy enforcement:
```
_dmarc.yourdomain.com IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100"
```
Start with `p=none` for monitoring, then move to `p=quarantine` or `p=reject`.

## Email Consent Management

TRES CRM respects email consent at multiple levels:

1. **Transactional emails** (verification, password reset, ticket notifications): always sent, no opt-out
2. **Survey emails**: respect the `emailOptOut` flag on Customer model
3. **Marketing/campaign emails**: require explicit opt-in; check `emailConsent` field

### Suppression List

The system automatically suppresses emails to:
- Addresses that have hard-bounced (tracked via `/api/v1/email-tracking/webhook`)
- Addresses that have filed spam complaints
- Addresses explicitly opted out

## Custom SMTP Domain Add-on ($20/mo)

Tenants on the SMTP_DOMAIN add-on can configure:
- Custom `From:` address using their own domain
- SPF/DKIM alignment for improved deliverability
- Dedicated IP allocation (enterprise plans)

Configuration is done in Settings > Branding > "Emails from" field.
