import { NextFunction, Response } from "express";
import { redis } from "../redis";
import { fail } from "../utils/response";
import { AuthedRequest } from "./auth";

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  // A name per limiter so the same user/IP has independent budgets for
  // "everything" vs. "sending messages" — otherwise browsing conversations
  // would eat into your message-sending budget.
  name: string;
  keyGenerator: (req: AuthedRequest) => string;
}

// Fixed-window counter in Redis: INCR a key scoped to the current window,
// set it to expire at the end of that window. Works correctly across
// multiple backend instances because the counter lives in Redis, not in
// any one process's memory — a requirement once the backend scales
// horizontally (see README, Day 4).
export function createRateLimiter(opts: RateLimiterOptions) {
  const windowSeconds = Math.ceil(opts.windowMs / 1000);

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const identifier = opts.keyGenerator(req);
    const windowStart = Math.floor(Date.now() / opts.windowMs);
    const key = `ratelimit:${opts.name}:${identifier}:${windowStart}`;

    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
    } catch {
      // Redis unavailable — fail open. Losing rate limiting temporarily is
      // safer for legitimate users than taking the whole API down because
      // a cache dependency is unhealthy.
      return next();
    }

    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));

    if (count > opts.max) {
      return fail(res, 429, "RATE_LIMITED", "Too many requests. Please slow down.");
    }

    next();
  };
}
