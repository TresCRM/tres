# Ticket Lifecycle

## Status Flow
```
ACTIVE -> CLOSED -> REOPENED -> CLOSED
         |                      |
         +-----> REOPENED ------+
```

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/v1/tickets` | TICKET_CREATE | Create ticket |
| GET | `/api/v1/tickets` | (any auth) | List with filters (status, priority, assignee, search) |
| GET | `/api/v1/tickets/:id` | (any auth) | Get ticket + comments |
| POST | `/api/v1/tickets/:id/reply` | COMMENT_CREATE | Add comment |
| POST | `/api/v1/tickets/:id/assign` | TICKET_ASSIGN | Assign to agent |
| POST | `/api/v1/tickets/:id/reassign` | TICKET_ASSIGN | Reassign with SLA history |
| POST | `/api/v1/tickets/:id/close` | TICKET_CLOSE | Close ticket |
| POST | `/api/v1/tickets/:id/reopen` | TICKET_REOPEN | Reopen closed ticket |

## Idempotency
Send `Idempotency-Key` header to prevent duplicate ticket creation. Returns existing ticket with `idempotent: true` if key matches.

## Attachments
- Upload: `POST /api/v1/tickets/:id/attachments` (multipart, max 10MB, png/jpeg/pdf)
- List: `GET /api/v1/tickets/:id/attachments`
- Delete: `DELETE /api/v1/attachments/:id`

## Events Emitted
`ticket.created`, `ticket.replied`, `ticket.assigned`, `ticket.reassigned`, `ticket.closed`, `ticket.reopened`
