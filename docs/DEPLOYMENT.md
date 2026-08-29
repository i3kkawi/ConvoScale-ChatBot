# Deployment Guide

**Read this first:** this document is written so you can execute it yourself — creating accounts
and clicking "deploy" isn't something that can be done on your behalf. Everything below is the
exact steps, in order, with the reasoning for each choice.

## Why two platforms, not one

| Component | Platform | Why |
|---|---|---|
| Backend API + Postgres + Redis | **Railway** | One platform, one project, for three things that need to run continuously and talk to each other over a private network — avoids paying egress/latency for cross-cloud database calls |
| Frontend (static build) | **Vercel** | Vite/React builds to static files; Vercel's CDN-first free tier is built exactly for that, with zero server to manage. Deploying it on Railway alongside the backend would work, but would mean paying for and managing a running container for something that's just static files. |

This is the same "architecture decides the tools" principle from Day 1: the backend is stateful
and long-running (needs a process, a DB connection, a Redis connection); the frontend is a build
artifact. They have different hosting needs, so they get different hosts.

If you'd rather keep everything on one platform (simpler to reason about, slightly worse fit),
Railway can also serve the frontend as a static site — see the note at the end.

---

## Part A — Backend + Postgres + Redis on Railway

### 1. Create the account and project
1. Go to https://railway.app and sign up (GitHub login is easiest, since you're pushing this repo
   to GitHub anyway).
2. **New Project → Deploy from GitHub repo** → select your `convoscale` repository.
3. Railway will try to auto-detect a service from the repo root. Delete that auto-detected
   service for now — you'll add three services explicitly.

### 2. Add PostgreSQL
1. In the project, **New → Database → Add PostgreSQL**.
2. Railway provisions it and exposes a `DATABASE_URL` variable automatically — you'll reference
   this from the backend service, you don't need to construct it by hand.

### 3. Add Redis
1. **New → Database → Add Redis**.
2. Same as above — Railway exposes a `REDIS_URL`.

### 4. Add the backend service
1. **New → GitHub Repo** → same repo, but set **Root Directory** to `backend/` (Railway builds
   from that subfolder instead of the repo root).
2. Railway detects the `Dockerfile` in `backend/` automatically and builds from it.
3. **Variables** tab — add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Reference the Postgres service's `DATABASE_URL` (Railway lets you reference another service's variable directly — use the "Add Reference" option rather than copy-pasting, so it stays in sync if it ever rotates) |
   | `REDIS_URL` | Same, referencing the Redis service |
   | `JWT_SECRET` | Generate a real random value: `openssl rand -base64 32` — **not** the placeholder from `.env.example` |
   | `JWT_EXPIRES_IN` | `1h` |
   | `RATE_LIMIT_WINDOW_MS` | `60000` |
   | `RATE_LIMIT_MAX_REQUESTS` | `300` |
   | `MESSAGE_RATE_LIMIT_MAX` | `60` |
   | `AUTH_RATE_LIMIT_MAX` | `20` |
   | `FRONTEND_ORIGIN` | Your Vercel URL once you have it (Part B) — update this after Part B, then redeploy |
   | `TRUST_PROXY` | `true` — Railway sits your app behind its own proxy, so `req.ip` needs this to reflect the real client (see `backend/src/app.ts`) |
   | `PORT` | `4000` (Railway reads the exposed port from the Dockerfile/`EXPOSE`, but setting it explicitly avoids ambiguity) |

4. **Settings → Networking → Generate Domain** — gives you a public HTTPS URL for the backend
   (something like `convoscale-backend-production.up.railway.app`).
5. Deploy. Railway runs the Dockerfile's `CMD`, which applies migrations
   (`prisma migrate deploy`) and starts the server — the same migration history you built locally
   is what runs in production, not a fresh schema.

### 5. Seed chatbot responses in production (once)
Railway's CLI can run a one-off command against the deployed service:
```bash
railway login
railway link          # select this project
railway run --service backend npm run prisma:seed
```

### 6. Verify
Visit `https://<your-backend-domain>/health` — expect
`{"status":"ok","database":"ok","redis":"ok"}`. If it says `"degraded"`, check the Variables tab
for typos before anything else.

---

## Part B — Frontend on Vercel

1. Go to https://vercel.com, sign up, **Add New → Project**, import the same GitHub repo.
2. **Root Directory:** `frontend`.
3. Framework preset: Vite (Vercel usually auto-detects this from `vite.config.ts`).
4. **Environment Variables:** add `VITE_API_URL` = your Railway backend's public URL from Part A
   step 4. (`App.tsx` currently hardcodes `http://localhost:4000` for local dev — before deploying,
   change that line to `import.meta.env.VITE_API_URL || "http://localhost:4000"` so it picks up
   this variable in production while still defaulting sensibly for local development.)
5. Deploy. Vercel gives you a URL like `convoscale.vercel.app`.
6. **Go back to Railway** and set the backend's `FRONTEND_ORIGIN` to this exact Vercel URL
   (including `https://`, no trailing slash), then redeploy the backend service — otherwise CORS
   will block the deployed frontend from calling the deployed backend.

---

## Verifying the full deployed chain

1. Open the Vercel URL in a browser.
2. It should show the `/health` JSON, fetched from the Railway backend — same check as the local
   "how to verify everything is connected" step, just against production URLs instead of
   `localhost`.
3. If it shows "could not reach backend": open browser devtools → Network tab → look for a CORS
   error specifically (vs. a connection failure) to tell whether the issue is `FRONTEND_ORIGIN`
   (CORS) or the backend simply being down/misconfigured.

---

## Environment variables — local vs. production, side by side

| Variable | Local value | Production value |
|---|---|---|
| `DATABASE_URL` | `docker-compose.yml` Postgres | Railway-managed Postgres (auto-generated) |
| `REDIS_URL` | `docker-compose.yml` Redis | Railway-managed Redis (auto-generated) |
| `JWT_SECRET` | Any string, doesn't matter for local dev | A real random secret, generated once, never committed |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Your Vercel URL |
| `TRUST_PROXY` | `false` | `true` |

---

## Alternative: one platform instead of two

If you'd rather not manage two accounts: Railway can serve the frontend too — add a fourth service
with **Root Directory** `frontend/`, build command `npm run build`, and a static file server (or
Railway's static-site service type if available on your plan). This trades a slightly worse fit
(paying for a running container to serve files that don't need one) for having everything in one
dashboard. Either is a legitimate choice — the two-platform version above is the one that best
matches "let the architecture pick the tool."

---

## Rolling back / redeploying

- **Railway:** every deploy is versioned — **Deployments** tab → pick a previous one → **Redeploy**.
- **Vercel:** same idea, under **Deployments** on the project dashboard.
- Database migrations do **not** automatically roll back with a code rollback — if a migration
  needs to be reverted, that's a manual `prisma migrate` operation, not something redeploying old
  code undoes for you. Keep this in mind before rolling back past a deploy that changed the schema.
