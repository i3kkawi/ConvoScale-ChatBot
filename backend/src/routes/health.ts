import { Router } from "express";
import { prisma } from "../db";
import { redis } from "../redis";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const result: {
    status: "ok" | "degraded";
    database: "ok" | "error";
    redis: "ok" | "error";
  } = { status: "ok", database: "ok", redis: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    result.database = "error";
    result.status = "degraded";
  }

  try {
    await redis.ping();
  } catch {
    result.redis = "error";
    result.status = "degraded";
  }

  res.status(result.status === "ok" ? 200 : 503).json(result);
});
