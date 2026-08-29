import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { messagesRouter } from "./routes/messages";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { createRateLimiter } from "./middleware/rateLimiter";

export function createApp() {
  const app = express();

  const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

  // Off by default for local dev. Turned on (via env) once deployed behind
  // a reverse proxy (Day 6) — otherwise req.ip would be the proxy's IP for
  // every request, and the rate limiter's per-IP budget would be shared by
  // every user behind it.
  if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json());
  app.use(requestLogger);

  // Global rate limiting — disabled only when RATE_LIMIT_ENABLED=false
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";

  if (rateLimitEnabled) {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const globalMax = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 300);

  app.use(
    createRateLimiter({
      windowMs,
      max: globalMax,
      name: "global",
      keyGenerator: (req) => req.ip ?? "unknown",
    })
  );
}

  app.use(healthRouter);
  app.use(authRouter);
  app.use(conversationsRouter);
  app.use(messagesRouter);

  app.use(errorHandler);

  return app;
}
