// Shared across all k6 scenario scripts.
export const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// The brief's actual target: 10,000 requests/minute ≈ 167 requests/second.
export const TARGET_RPS = 167;

// Shared pass/fail thresholds — a scenario "fails" its checks in the k6
// summary if these aren't met, so you don't have to eyeball the numbers.
export const STANDARD_THRESHOLDS = {
  http_req_failed: ["rate<0.01"], // error rate under 1%
  http_req_duration: ["p(95)<500", "p(99)<1000"],
};
