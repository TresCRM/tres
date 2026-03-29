# Embeddable Widget Integration

## Setup
1. Generate widget token: `POST /api/v1/settings/widget-token`
2. Add to your website:
```html
<script src="https://cdn.trescrm.com/widget/v1/tres-widget.min.js"
  data-tenant="your-slug"
  data-token="pub_your_token"
  data-position="bottom-right"
  data-accent="#4F46E5">
</script>
```

## Configuration
| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-tenant` | Tenant slug | (required) |
| `data-token` | Widget token (pub_xxx) | (required) |
| `data-position` | `bottom-right` or `bottom-left` | `bottom-right` |
| `data-accent` | Accent color (hex) | `#4F46E5` |
| `data-api-base` | API base URL | `http://localhost:4000` |

## Programmatic API
```js
TresCRM.init({ tenant, token, position, accentColor, greeting });
TresCRM.open();    // Open widget
TresCRM.close();   // Close widget
TresCRM.destroy(); // Remove from DOM
```

## Domain Allowlisting
Configure allowed domains via `PUT /api/v1/settings/widget-token`:
```json
{ "allowedDomains": ["https://mysite.com", "https://app.mysite.com"] }
```
Requests from unlisted domains are rejected.

## Security
- Widget token is domain-bound (not a secret)
- All ticket bodies sanitized (XSS prevention)
- Tracking tokens scoped to email + tenant + ticket
- Customer replies marked `isAgent: false`
