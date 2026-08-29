// Stresses /auth/login specifically — separate from mixed-load.js so login
// performance (bcrypt.compare cost, DB lookup, session write) can be
// measured on its own rather than blended into general traffic.
//
// Note: AUTH_RATE_LIMIT_MAX (default 20/min/IP) will cause 429s at this VU
// count if run from a single machine/IP — that's expected and correct
// behavior, not a bug. Check the 429 rate, not just the error rate.
//
// Run: k6 run loadtest/scenarios/auth-flow.js

import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "../lib/config.js";

export const options = {
  vus: 20,
  duration: "30s",
};

const email = "loadtest-auth@example.com";
const password = "correct-horse-battery-staple";

export function setup() {
  http.post(`${BASE_URL}/auth/register`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
  });
}

export default function () {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, {
    "login succeeded or was correctly rate-limited": (r) => r.status === 200 || r.status === 429,
  });
}
