# TRES CRM Workers

Background job processing: billing worker + NATS event listener.

## Billing Worker

Processes subscription renewals, sends dunning reminders (T-14/T-7/T-3/T-1), and expires overdue subscriptions.

```bash
pnpm worker:billing          # Run once
pnpm dev:workers              # Run with hot reload
```

## NATS Event Listener

Subscribes to `ticket.events` and dispatches:
- Email notifications to watchers/assignees
- Webhook deliveries to registered endpoints

## Adding a New Worker

1. Create `jobs/myjob.ts` with processing logic
2. Import and call from `index.ts`
3. Add scheduling (node-cron) for recurring jobs
