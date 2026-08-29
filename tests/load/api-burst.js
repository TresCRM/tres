import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

/**
 * API Burst Test — Ticket Creation
 *
 * Sustains 500 req/s of ticket creation to measure write throughput,
 * database contention, and queue backpressure.
 *
 * Run:
 *   k6 run --env BASE_URL=http://localhost:4000 --env AUTH_TOKEN=<jwt> tests/load/api-burst.js
 */

const ticketsCreated = new Counter('tickets_created');
const createFailRate = new Rate('ticket_create_fail_rate');

export const options = {
  scenarios: {
    burst_create: {
      executor: 'constant-arrival-rate',
      rate: 500,               // 500 iterations per timeUnit
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 200,
      maxVUs: 600,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    ticket_create_fail_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  if (!__ENV.AUTH_TOKEN) {
    console.error('AUTH_TOKEN env var is required for ticket creation burst test');
    return;
  }

  const headers = {
    Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const payload = JSON.stringify({
    subject: `Load test ticket ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Automated load test ticket — safe to delete.',
    priority: 'low',
    channel: 'api',
  });

  const res = http.post(`${BASE_URL}/api/v1/tickets`, payload, { headers });

  const ok = check(res, {
    'ticket created 201': (r) => r.status === 201,
    'has ticket id': (r) => {
      try { return !!JSON.parse(r.body).data?._id; } catch { return false; }
    },
  });

  if (ok) {
    ticketsCreated.add(1);
    createFailRate.add(0);
  } else {
    createFailRate.add(1);
  }
}
