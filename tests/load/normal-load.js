import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/healthz`);
  check(health, { 'healthz 200': (r) => r.status === 200 });

  // List tickets (with auth token from env)
  if (__ENV.AUTH_TOKEN) {
    const tickets = http.get(`${BASE_URL}/api/v1/tickets`, {
      headers: { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` },
    });
    check(tickets, { 'tickets 200': (r) => r.status === 200 });
  }

  sleep(1);
}
