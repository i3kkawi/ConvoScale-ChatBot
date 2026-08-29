import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";

// Logs asynchronously and never blocks or fails the request on a logging
// error — request logging is observability, not a correctness requirement.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    prisma.requestLog
      .create({
        data: {
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          durationMs,
          userId: (req as any).userId ?? null,
        },
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[request-logger] failed to write log:", err.message);
      });
  });

  next();
}
