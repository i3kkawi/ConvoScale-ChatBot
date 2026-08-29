// The primary evidence script for the brief's requirement: sustained
// ~10,000 requests/minute (167 req/s) against a realistic MIX of endpoints,
// not just one. Uses k6's constant-arrival-rate executor, which is built
// specifically for "hit this many requests per second" targets — VU-count
// executors approximate a rate indirectly; this one targets it directly.
//
// Run:
//   k6 run loadtest/scenarios/mixed-load.js
//   k6 run --env BASE_URL=http://localhost:4000 loadtest/scenarios/mixed-load.js
//
// Requires the backend, Postgres, and Redis all running (docker compose up +
// npm run dev), and the chatbot responses seeded (npm run prisma:seed).

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, TARGET_RPS, STANDARD_THRESHOLDS } from "../lib/config.js";

const USER_COUNT = 50; // enough spread that the per-user message rate limit
                        // (60/min/user, see Day 4) doesn't become the bottleneck
                        // instead of the thing actually being measured

export const options = {
  scenarios: {
    mixed_traffic: {
      executor: "constant-arrival-rate",
      rate: TARGET_RPS,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },
  thresholds: STANDARD_THRESHOLDS,
};

// setup() runs once, before the load phase, and its return value is passed
// into every default() call — this is where the test users get created so
// the load phase itself is pure traffic, not account creation.
export function setup() {
  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const email = `loadtest-${Date.now()}-${i}@example.com`;
    const password = "correct-horse-battery-staple";

    const reg = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password }),
      { headers: { "Content-Type": "application/json" } }
    );
    if (reg.status !== 201) continue; // e.g. hit the auth rate limiter during setup

    const login = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: { "Content-Type": "application/json" } }
    );
    const token = login.json("data.token");

    const conv = http.post(
      `${BASE_URL}/conversations`,
      JSON.stringify({ title: "Load test conversation" }),
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
    );
    const conversationId = conv.json("data.conversation.id");

    users.push({ token, conversationId });
  }

  if (users.length === 0) {
    throw new Error("setup() created zero users — is the backend reachable at " + BASE_URL + "?");
  }
  return { users };
}

export default function (data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const authHeaders = { headers: { Authorization: `Bearer ${user.token}` } };

  // Weighted mix, roughly modeling real traffic: cheap reads dominate,
  // writes are the minority — same shape the brief describes ("mixed read
  // and write traffic").
  const roll = Math.random();

  if (roll < 0.4) {
    // 40% — health check / monitoring-style traffic
    const res = http.get(`${BASE_URL}/health`);
    check(res, { "health: 200 or 503": (r) => r.status === 200 || r.status === 503 });
  } else if (roll < 0.7) {
    // 30% — list conversations (paginated read)
    const res = http.get(`${BASE_URL}/conversations?limit=20`, authHeaders);
    check(res, { "list conversations: 200": (r) => r.status === 200 });
  } else if (roll < 0.9) {
    // 20% — read message history (keyset-paginated read)
    const res = http.get(
      `${BASE_URL}/conversations/${user.conversationId}/messages?limit=20`,
      authHeaders
    );
    check(res, { "list messages: 200": (r) => r.status === 200 });
  } else {
    // 10% — the expensive write: send a message (transaction + chatbot lookup)
    const res = http.post(
      `${BASE_URL}/conversations/${user.conversationId}/messages`,
      JSON.stringify({ body: "hello", requestId: `k6-${__VU}-${__ITER}-${Date.now()}` }),
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` } }
    );
    check(res, { "send message: 201 or 429": (r) => r.status === 201 || r.status === 429 });
  }

  sleep(0.05);
}
