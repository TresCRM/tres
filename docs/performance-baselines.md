# Performance Baselines

## Targets

| Metric                          | Target           |
|---------------------------------|------------------|
| API P99 latency (normal load)   | < 500ms          |
| API P99 latency (peak load)     | < 2s             |
| Ticket creation throughput      | > 200 req/s      |
| WebSocket concurrent connections| 5000             |
| Widget load time                | < 200ms          |
| Dashboard LCP                   | < 2 seconds      |

## How to Run

```bash
# Normal load — ramp to 200 users over 8 minutes
k6 run tests/load/normal-load.js

# Peak load — 1000 concurrent users for 5 minutes
k6 run --env BASE_URL=https://api.staging.tres-crm.com tests/load/peak-load.js

# Burst — 500 req/s sustained ticket creation
k6 run --env BASE_URL=https://api.staging.tres-crm.com --env AUTH_TOKEN=<jwt> tests/load/api-burst.js
```

## Baseline Measurements

Record results after each infrastructure change or major release.

| Date       | Test      | P50   | P95   | P99   | Error Rate | Notes            |
|------------|-----------|-------|-------|-------|------------|------------------|
| YYYY-MM-DD | normal    | --ms  | --ms  | --ms  | --%        | Initial baseline |
| YYYY-MM-DD | peak      | --ms  | --ms  | --ms  | --%        |                  |
| YYYY-MM-DD | burst     | --ms  | --ms  | --ms  | --%        |                  |

## Alerting Thresholds

Production monitoring should alert when:

- API P99 latency exceeds 1s for 5 consecutive minutes
- Error rate exceeds 2% over a 1-minute window
- Active WebSocket connections drop by more than 20% in 1 minute
- MongoDB query time P95 exceeds 200ms
