# Webhooks

## Setup
1. Register: `POST /api/v1/webhooks` with `{ url, events }` -- returns secret (shown once)
2. Store the secret securely for signature verification

## Events
`ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.closed`, `ticket.replied`, `survey.submitted`, `subscription.expiring_soon`, `subscription.expired`, `payment.succeeded`, `payment.failed`

## Payload Format
```json
{
  "event": "ticket.created",
  "tenantId": "...",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "data": { ... }
}
```

## Signature Verification
Every webhook includes `X-Webhook-Signature` (HMAC-SHA256 of the JSON body using your secret) and `X-Webhook-Timestamp`.

```js
const crypto = require('crypto');
const expected = crypto.createHmac('sha256', YOUR_SECRET).update(rawBody).digest('hex');
if (expected !== req.headers['x-webhook-signature']) throw new Error('Invalid signature');
```

## Failure Handling
- Timeout: 10 seconds
- Auto-disabled after 10 consecutive failures
- Re-enable via `PUT /api/v1/webhooks/:id` with `{ isActive: true }` (resets fail count)
- Test connectivity: `POST /api/v1/webhooks/:id/test`
