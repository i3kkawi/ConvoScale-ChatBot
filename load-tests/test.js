import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    load_test: {
      executor: 'constant-arrival-rate',
      rate: 167,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 50,
      maxVUs: 500,
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = 'http://localhost:4000';

const CONVERSATION_ID = '539e7686-f9fd-41d6-9b1e-db7817d50a32';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3NTcwMWQ3MS0wNzVmLTQ0M2ItYTQ0OS0wNjA3ZjA0MTg2YmIiLCJpYXQiOjE3ODc5ODU5MTcsImV4cCI6MTc4Nzk4OTUxN30.nPajKbugcqBdKbqdmcwMdaa2YEi7YFuux7N6Ub9iU6o';

export default function () {
  const payload = JSON.stringify({
    body: 'Hello from k6 load test',
    requestId: `k6-${__VU}-${__ITER}-${Date.now()}`,
  });

  const res = http.post(
    `${BASE_URL}/conversations/${CONVERSATION_ID}/messages`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );

  check(res, {
    'status is 201': (r) => r.status === 201,
  });
}