# Incident Response Runbook

## 1. Severity Classification

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| **P1** | Service down / data loss | 15 min | API completely unresponsive, database corruption |
| **P2** | Major feature broken | 30 min | Payment processing failures, auth broken |
| **P3** | Degraded performance | 2 hours | High latency, intermittent errors |
| **P4** | Minor issue | Next business day | UI glitch, non-critical log noise |

---

## 2. On-Call Response Procedures

1. **Acknowledge** the alert within the response-time window.
2. **Assess** severity using the classification above.
3. **Communicate** in the `#incidents` channel: what is known, who is investigating.
4. **Mitigate** — restore service first, root-cause later.
5. **Escalate** if the issue is not mitigated within 30 minutes (P1/P2).
6. **Resolve** and update the status page.
7. **Document** — open a post-incident review ticket.

---

## 3. Common Incidents

### 3.1 API Unresponsive

```bash
# 1. Check health endpoint
curl -sf https://<host>/healthz || echo "UNHEALTHY"

# 2. Check container / process status
docker ps | grep tres-api
docker logs --tail 200 tres-api

# 3. Restart the service
docker restart tres-api

# 4. If restart fails, check MongoDB connectivity
mongosh --eval "db.adminCommand('ping')"
```

### 3.2 High Error Rate

```bash
# 1. Check Prometheus metrics
curl -s http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{status=~"5.."}[5m]))

# 2. Review Sentry for new exceptions
#    https://sentry.io/organizations/<org>/issues/

# 3. Tail application logs
docker logs --tail 500 tres-api | grep -i error
```

### 3.3 Payment Failures

1. Check the **Stripe Dashboard** for webhook delivery failures.
2. Inspect the billing worker logs:
   ```bash
   docker logs --tail 300 tres-billing-worker
   ```
3. Verify the `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` env vars are set.
4. Replay failed webhooks from the Stripe dashboard if needed.

### 3.4 NATS Disconnect

```bash
# 1. Check NATS monitoring endpoint
curl -s http://localhost:8222/varz | jq .

# 2. Check JetStream status
curl -s http://localhost:8222/jsz | jq .

# 3. Restart NATS
docker restart tres-nats

# 4. Verify consumers reconnected
curl -s http://localhost:8222/connz | jq '.connections | length'
```

### 3.5 MongoDB High Latency

```bash
# 1. Check connection pool saturation
mongosh --eval "db.serverStatus().connections"

# 2. Enable slow-query profiler (threshold 100 ms)
mongosh --eval "db.setProfilingLevel(1, { slowms: 100 })"

# 3. Review slow queries
mongosh --eval "db.system.profile.find().sort({ts:-1}).limit(10).pretty()"

# 4. Check disk I/O on the database host
iostat -x 1 5
```

---

## 4. Rollback Procedure

### Application Rollback

```bash
# Revert to previous release commit
git revert HEAD --no-edit
git push origin main

# OR roll back Docker image
docker pull ghcr.io/tres/api:<previous-tag>
docker-compose up -d tres-api
```

### Database Restore

```bash
# Restore from latest backup
mongorestore --uri="$MONGO_URI" --drop --archive=/backups/latest.archive --gzip
```

See [rollback.md](rollback.md) for the full quick-reference.

---

## 5. Backup & Restore

| Parameter | Value |
|-----------|-------|
| **RPO** (Recovery Point Objective) | 24 hours |
| **RTO** (Recovery Time Objective) | 4 hours |

### MongoDB Backup

```bash
# Daily logical backup
mongodump --uri="$MONGO_URI" --archive=/backups/$(date +%F).archive --gzip

# Point-in-Time Recovery (PITR) via oplog
# Requires replica set with oplog enabled
mongodump --uri="$MONGO_URI" --oplog --archive=/backups/pitr-$(date +%F_%H%M).archive --gzip
```

### Restore

```bash
mongorestore --uri="$MONGO_URI" --drop --archive=/backups/<file>.archive --gzip

# PITR restore to specific timestamp
mongorestore --uri="$MONGO_URI" --oplogReplay --oplogLimit="<timestamp>" \
  --archive=/backups/pitr-<file>.archive --gzip
```

---

## 6. Escalation Matrix

| Level | Role | Contact | When |
|-------|------|---------|------|
| L1 | On-Call Engineer | `#incidents` / PagerDuty | First responder |
| L2 | Team Lead | (insert contact) | P1/P2 not mitigated in 30 min |
| L3 | Engineering Manager | (insert contact) | P1 not mitigated in 1 hour |
| L4 | VP Engineering / CTO | (insert contact) | Data loss or extended outage > 2 hours |

---

## 7. Post-Incident Review Template

```markdown
# Post-Incident Review — [TITLE]

**Date:** YYYY-MM-DD
**Severity:** P1 / P2 / P3 / P4
**Duration:** HH:MM
**Author:** [Name]

## Summary
Brief description of what happened.

## Timeline
- HH:MM — Alert fired
- HH:MM — Acknowledged by [name]
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service restored

## Root Cause
What caused the incident.

## Impact
- Users affected: N
- Revenue impact: $X (if applicable)
- Data loss: Yes / No

## Action Items
- [ ] Short-term fix
- [ ] Long-term prevention
- [ ] Monitoring improvement
- [ ] Runbook update

## Lessons Learned
What went well, what could be improved.
```
