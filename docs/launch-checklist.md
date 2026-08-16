# Launch Readiness Checklist

## Legal
- [ ] Privacy Policy published and linked from footer
- [ ] Terms of Service published and linked from footer
- [ ] Cookie Policy published with consent banner
- [ ] CAN-SPAM compliance verified (see `docs/email-can-spam.md`)
- [ ] Data Processing Agreement (DPA) available for enterprise customers
- [ ] GDPR data export / deletion workflow tested

## Monitoring
- [ ] Sentry DSN configured for production (API + Web)
- [ ] Prometheus metrics endpoint accessible from Grafana
- [ ] Alerting rules configured (P99 latency, error rate, disk usage)
- [ ] Uptime monitoring on `/healthz` endpoint (e.g., Pingdom, UptimeRobot)
- [ ] Log aggregation pipeline verified (structured JSON logs)
- [ ] On-call rotation established with escalation policy

## Security
- [ ] OWASP checklist reviewed (see `docs/security-checklist.md`)
- [ ] JWT secrets rotated from development defaults
- [ ] CORS origins restricted to production domains only
- [ ] Rate limiting tuned for production traffic
- [ ] SSL/TLS certificates valid and auto-renewing
- [ ] Dependabot alerts triaged (no critical/high vulnerabilities)
- [ ] Penetration test completed or scheduled

## Infrastructure
- [ ] Production MongoDB replica set configured with backups
- [ ] Redis/cache layer provisioned (if applicable)
- [ ] CDN configured for static assets
- [ ] DNS records configured (A, CNAME, MX, SPF, DKIM, DMARC)
- [ ] Email deliverability verified (SPF/DKIM/DMARC passing)
- [ ] Load test baselines recorded (see `docs/performance-baselines.md`)
- [ ] Auto-scaling policies configured

## Support
- [ ] Support email address configured and monitored
- [ ] Knowledge base / FAQ seeded with common questions
- [ ] Ticket escalation workflow documented
- [ ] SLA response times defined per plan tier
- [ ] Status page configured (e.g., Statuspage, Instatus)

## Marketing & Analytics
- [ ] Analytics tracking configured (PostHog, Mixpanel, or GA4)
- [ ] Conversion funnel events defined (signup, onboard, upgrade)
- [ ] SEO meta tags and Open Graph tags on public pages
- [ ] Sitemap.xml generated
- [ ] robots.txt configured
- [ ] Social media profiles linked

## Final Verification
- [ ] End-to-end signup flow tested on production
- [ ] Email verification flow tested
- [ ] Password reset flow tested
- [ ] Billing / subscription upgrade flow tested
- [ ] Portal widget embed tested on external domain
- [ ] Mobile responsiveness verified on iOS and Android
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Lighthouse score > 90 on key pages
- [ ] Seed data cleaned from production database
- [ ] Admin account credentials secured and documented
