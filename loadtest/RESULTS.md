# Load Test Results

The brief is explicit: writing "supports 10,000 requests per minute" in the README is not
evidence. This file is where the REAL k6 output goes, pasted in after actually running the
scripts in `loadtest/scenarios/` against a running instance of the app.

Do not edit the numbers below by hand — replace this whole section with the actual terminal
output from `k6 run`, or with a screenshot placed in `loadtest/results/`.

## How to produce this evidence

```bash
# Terminal 1
docker compose up

# Terminal 2
cd backend
npm run prisma:migrate
npm run prisma:seed
npm run dev

# Terminal 3 — install k6 first: https://k6.io/docs/get-started/installation/
k6 run loadtest/scenarios/mixed-load.js          | tee loadtest/results/mixed-load.txt
k6 run loadtest/scenarios/messaging-burst.js     | tee loadtest/results/messaging-burst.txt
k6 run loadtest/scenarios/auth-flow.js           | tee loadtest/results/auth-flow.txt
```

`tee` prints to the terminal AND saves to a file, so you get both a live view and a saved copy to
paste in below / attach as a screenshot.

## What to record for each run (per the brief's required evidence list)

- [ ] Test scenario (which script)
- [ ] Number of virtual users / arrival rate used
- [ ] Test duration
- [ ] Total requests
- [ ] Successful requests
- [ ] Failed requests (and their status codes — distinguish 429 rate-limits from real 5xx errors)
- [ ] Average response time
- [ ] P95 response time
- [ ] P99 response time
- [ ] Requests per second (k6 reports this directly as `http_reqs`)

k6's own summary output at the end of each run already contains every one of these numbers — no
manual calculation needed. Paste the `k6 run` summary block directly.

## `mixed-load.js` — the primary 10k req/min evidence

```
PASTE REAL k6 SUMMARY OUTPUT HERE
```

**Target:** 167 req/s sustained for 2 minutes (≈ 20,000 requests total, ≈ 10,000/min).
**Result:** _fill in after running_

## `messaging-burst.js` — 100 / 500 / 1000 concurrent users

```
PASTE REAL k6 SUMMARY OUTPUT HERE
```

## `auth-flow.js` — login endpoint under load

```
PASTE REAL k6 SUMMARY OUTPUT HERE
```

## Notes / anomalies observed

_What broke, if anything. What you changed as a result. This section is expected to have content
— a load test that reveals nothing to fix usually means the test wasn't hard enough._
