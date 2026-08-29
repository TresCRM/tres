import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Peak Load Test
 *
 * Simulates 1000 concurrent users sustained for 5 minutes to validate
 * system behavior under maximum expected load.
 *
 * Run:
 *   k6 run --env BASE_URL=http://localhost:4000 --env AUTH_TOKEN=<jwt> tests/load/peak-load.js
 */
export const options = {
  stages: [
    { duration: '2m', target: 500 },   // ramp up to 500 users
    { duration: '1m', target: 1000 },   // ramp up to 1000 users
    { duration: '5m', target: 1000 },   // sustain 1000 users
    { duration: '2m', target: 0 },      // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'],  // P99 under 2s at peak
    http_req_failed: ['rate<0.05'],     // < 5% error rate under stress
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  // Health endpoint — lightweight, always hit
  const health = http.get(`${BASE_URL}/healthz`);
  check(health, { 'healthz 200': (r) => r.status === 200 });

  if (__ENV.AUTH_TOKEN) {
    const headers = { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` };

    // List tickets — read-heavy workload
    const tickets = http.get(`${BASE_URL}/api/v1/tickets`, { headers });
    check(tickets, { 'tickets 200': (r) => r.status === 200 });

    // Dashboard stats — aggregation query
    const dashboard = http.get(`${BASE_URL}/api/v1/dashboard/stats`, { headers });
    check(dashboard, {
      'dashboard 2xx': (r) => r.status >= 200 && r.status < 300,
    });

    // Customer list
    const customers = http.get(`${BASE_URL}/api/v1/customers?limit=20`, { headers });
    check(customers, {
      'customers 2xx': (r) => r.status >= 200 && r.status < 300,
    });
  }

  sleep(0.5);
}
