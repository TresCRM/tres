# Rollback Quick Reference

## 1. Application Rollback

### Git Revert (preferred for tracked releases)

```bash
# Revert the last release commit
git revert HEAD --no-edit
git push origin main

# Revert a specific commit
git revert <commit-sha> --no-edit
git push origin main
```

### Docker Tag Rollback

```bash
# List available tags
docker image ls ghcr.io/tres/api --format '{{.Tag}}'

# Roll back to a specific tag
export ROLLBACK_TAG=<previous-tag>
docker pull ghcr.io/tres/api:$ROLLBACK_TAG
docker-compose down tres-api
IMAGE_TAG=$ROLLBACK_TAG docker-compose up -d tres-api

# Verify health
curl -sf https://<host>/healthz && echo "OK" || echo "FAILED"
```

---

## 2. Database Rollback

### Full Restore from Backup

```bash
# Stop writes (optional — scale API to 0 or enable maintenance mode)
docker-compose stop tres-api

# Restore
mongorestore --uri="$MONGO_URI" --drop \
  --archive=/backups/<backup-file>.archive --gzip

# Restart API
docker-compose up -d tres-api
```

### Point-in-Time Recovery (PITR)

```bash
# Restore to a specific oplog timestamp
mongorestore --uri="$MONGO_URI" --drop --oplogReplay \
  --oplogLimit="Timestamp(<seconds>, <increment>)" \
  --archive=/backups/pitr-<file>.archive --gzip
```

### Single Collection Restore

```bash
mongorestore --uri="$MONGO_URI" --drop \
  --nsInclude="trescrm.<collection>" \
  --archive=/backups/<backup-file>.archive --gzip
```

---

## 3. Feature Flag Disable

If the issue is isolated to a feature behind a flag:

```bash
# Via environment variable
export FEATURE_<NAME>_ENABLED=false
docker-compose up -d tres-api

# Via database (if using DB-backed flags)
mongosh --eval 'db.featureFlags.updateOne(
  { key: "<flag-name>" },
  { $set: { enabled: false } }
)'
```

No restart required if the application polls feature flags at runtime.

---

## 4. DNS Failover

If the primary region is completely unavailable:

```bash
# Update DNS to point to the standby region
# (Example using Cloudflare API — adjust for your provider)

export CF_ZONE_ID="<zone-id>"
export CF_RECORD_ID="<record-id>"
export CF_API_TOKEN="<token>"
export STANDBY_IP="<standby-region-ip>"

curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$CF_RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"content\":\"$STANDBY_IP\"}"
```

### Verification

```bash
# Confirm DNS propagation
dig +short api.trescrm.com

# Confirm standby is healthy
curl -sf https://api.trescrm.com/healthz
```

### Failback

Once the primary region is restored, reverse the DNS change and verify traffic is flowing correctly before decommissioning the standby.
