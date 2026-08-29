// Placeholder smoke test — confirms the backend is reachable under light load.
// The real 10,000 req/min load test scripts are built on the testing day.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "10s",
};

export default function () {
  const res = http.get("http://localhost:4000/health");
  check(res, { "status is 200 or 503": (r) => r.status === 200 || r.status === 503 });
  sleep(1);
}
