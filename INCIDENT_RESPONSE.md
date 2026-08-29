# Incident Response Plan — TRES CRM

## 1. Severity Levels

| Level | Name | Description | Response Time | Examples |
|-------|------|-------------|---------------|----------|
| SEV-1 | Critical | Active data breach, system-wide compromise, complete service outage | 15 min | Stolen database dump, RCE exploit, all sessions compromised |
| SEV-2 | High | Partial breach, significant security flaw exploited, major degradation | 1 hour | Single tenant data leak, auth bypass, token theft detected |
| SEV-3 | Medium | Vulnerability discovered (not yet exploited), minor degradation | 4 hours | Unpatched CVE in dependency, rate limit bypass, CSRF flaw |
| SEV-4 | Low | Security improvement needed, informational finding | Next sprint | Missing headers, minor config issues, audit log gaps |

## 2. Response Team

| Role | Responsibility | Escalation |
|------|---------------|------------|
| **First Responder** | Acknowledge alert, initial assessment, classify severity | Any engineer on-call |
| **Incident Commander** | Coordinate response, authorize actions, manage communication | Engineering lead / CTO |
| **Security Lead** | Technical investigation, forensics, remediation plan | Senior backend engineer |
| **Communications** | Customer notification, status page updates, regulatory reporting | Product / legal |

## 3. Detection Sources

- **Automated**: Security event logger (`securityLogger.ts`) — monitors for `auth.token.stolen`, `auth.login.locked`, `auth.mfa.failed`
- **Dependency scanning**: GitHub Actions `security-audit.yml` — daily scan, alerts on critical/high CVEs
- **Activity logs**: MongoDB `activity_logs` collection — suspicious patterns (bulk data access, unusual hours)
- **Error logs**: MongoDB `error_logs` collection — spikes in 401/403 errors
- **External**: Bug bounty reports, customer reports, third-party advisories

## 4. Response Procedures

### Phase 1: Identification (0–15 min)
1. Acknowledge the alert/report
2. Classify severity using the table above
3. Create incident channel (Slack/Teams) named `inc-YYYY-MM-DD-brief-description`
4. Assign Incident Commander
5. Begin incident log with timestamps

### Phase 2: Containment (15 min – 1 hour)
**Immediate actions by severity:**

**SEV-1/SEV-2:**
- Revoke all active sessions: `db.refreshtokens.updateMany({ revokedAt: null }, { $set: { revokedAt: new Date() } })`
- Rotate JWT secrets (`JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)
- If API keys compromised: `db.apikeys.updateMany({}, { $set: { isActive: false } })`
- Enable maintenance mode if needed
- Preserve evidence: snapshot affected database collections before any cleanup

**SEV-3/SEV-4:**
- Assess blast radius
- Determine if exploit is actively being used
- Prepare patch without emergency deployment

### Phase 3: Eradication (1–4 hours)
1. Identify root cause (code review, log analysis)
2. Develop and test fix in isolated environment
3. Review fix with second engineer (mandatory for SEV-1/SEV-2)
4. Deploy fix to production

### Phase 4: Recovery
1. Verify fix is effective in production
2. Re-enable any disabled systems/features
3. Monitor for recurrence (30 min observation)
4. If user data was affected:
   - Notify affected tenants via email
   - Update status page
   - File regulatory report if required (GDPR: 72 hours)

### Phase 5: Post-Mortem (within 48 hours)
1. Write incident report with:
   - Timeline of events
   - Root cause analysis (5 Whys)
   - What went well / what didn't
   - Action items with owners and deadlines
2. Share with engineering team
3. Update this SOP if gaps identified
4. Schedule follow-up review in 2 weeks

## 5. Key Commands Reference

```bash
# Revoke all sessions for a specific user
db.refreshtokens.updateMany({ userId: ObjectId("USER_ID") }, { $set: { revokedAt: new Date() } })

# Revoke all sessions system-wide (emergency)
db.refreshtokens.updateMany({ revokedAt: null }, { $set: { revokedAt: new Date() } })

# Disable all API keys for a tenant
db.apikeys.updateMany({ tenantId: ObjectId("TENANT_ID") }, { $set: { isActive: false } })

# Lock a specific user account
db.users.updateOne({ _id: ObjectId("USER_ID") }, { $set: { status: "DISABLED" } })

# Check recent security events
db.activity_logs.find({ method: "SECURITY" }).sort({ _id: -1 }).limit(50)

# Check recent failed logins
db.activity_logs.find({ route: { $regex: /auth.login.failed/ } }).sort({ _id: -1 }).limit(50)

# Check for stolen token events
db.activity_logs.find({ route: "auth.token.stolen" }).sort({ _id: -1 })
```

## 6. Regulatory Reporting

| Regulation | Deadline | Authority | Trigger |
|-----------|----------|-----------|---------|
| GDPR Art. 33 | 72 hours | Data Protection Authority | Personal data breach affecting EU residents |
| GDPR Art. 34 | Without undue delay | Affected individuals | High risk to rights and freedoms |
| SOC 2 | Per audit cycle | Auditor | Any control failure during audit period |

## 7. Contact Information

| Contact | Method | When to Use |
|---------|--------|-------------|
| Engineering On-Call | PagerDuty / Slack #oncall | First response for any alert |
| Security Lead | Direct message | SEV-1/SEV-2 incidents |
| Legal / DPO | Email: legal@trescrm.com | Data breaches requiring notification |
| Hosting Provider | Support portal | Infrastructure-level incidents |

## 8. Review Schedule

- This document is reviewed quarterly
- Last reviewed: 2026-03-31
- Next review: 2026-06-30
- Owner: Security Lead
