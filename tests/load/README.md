# Load Tests

k6-based load tests for TRES CRM API.

## Prerequisites

Install [k6](https://k6.io/docs/getting-started/installation/):

```bash
# macOS
brew install k6

# Windows (winget)
winget install k6

# Docker
docker pull grafana/k6
```

## Environment Variables

| Variable     | Required | Description                                      |
|------------- |----------|--------------------------------------------------|
| `BASE_URL`   | No       | API base URL (default: `http://localhost:4000`)   |
| `AUTH_TOKEN`  | Yes*     | JWT access token for authenticated endpoints     |

*AUTH_TOKEN is optional for `normal-load.js` health-check-only mode, but required for ticket endpoints and burst tests.

### Getting an AUTH_TOKEN

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YourPassword"}' \
  | jq -r '.accessToken'
```

## Running Tests

### Normal Load (ramp to 200 users)

```bash
k6 run tests/load/normal-load.js
k6 run --env AUTH_TOKEN=<token> tests/load/normal-load.js
```

### Peak Load (1000 concurrent users)

```bash
k6 run --env AUTH_TOKEN=<token> tests/load/peak-load.js
```

### API Burst (500 req/s ticket creation)

```bash
k6 run --env AUTH_TOKEN=<token> tests/load/api-burst.js
```

### Against Staging

```bash
k6 run --env BASE_URL=https://api.staging.tres-crm.com --env AUTH_TOKEN=<token> tests/load/peak-load.js
```

## Interpreting Results

k6 outputs a summary table after each run. Key metrics:

| Metric                | What it means                              | Target (normal) | Target (peak) |
|-----------------------|--------------------------------------------|-----------------|----------------|
| `http_req_duration`   | Response time percentiles                  | P99 < 500ms     | P99 < 2s       |
| `http_req_failed`     | Percentage of non-2xx responses            | < 1%            | < 5%           |
| `http_reqs`           | Total requests made                        | --              | --             |
| `vus`                 | Current virtual users                      | --              | --             |
| `tickets_created`     | (burst only) Successfully created tickets  | --              | --             |

### Thresholds

If a threshold is breached, k6 exits with a non-zero code. This can be used in CI to gate deployments.

### Exporting Results

```bash
# JSON output for dashboards
k6 run --out json=results.json tests/load/normal-load.js

# InfluxDB for Grafana dashboards
k6 run --out influxdb=http://localhost:8086/k6 tests/load/normal-load.js
```

## Cleanup

The burst test creates tickets with description "Automated load test ticket". Clean up after testing:

```bash
# MongoDB shell
db.tickets.deleteMany({ description: /Automated load test ticket/ })
```
