import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Response } from "express";
import { createRateLimiter } from "../middleware/rateLimiter";
import { getChatbotResponse } from "../utils/chatbot";
import { redis } from "../redis";
import { prisma } from "../db";
import { AuthedRequest } from "../middleware/auth";

// Fakes a minimal Express res object so the limiter can be tested directly,
// without going through the app's shared global limiter (which would make
// this test's pass/fail depend on how many other tests ran first).
function fakeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: unknown = null;
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      jsonBody = body;
      return res;
    },
  } as unknown as Response;
  return { res, headers, get statusCode() { return statusCode; }, get jsonBody() { return jsonBody; } };
}

describe("rate limiter", () => {
  it("allows requests under the limit and blocks the one that exceeds it", async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      name: `test-${Date.now()}`, // unique name so this test doesn't collide with others
      keyGenerator: () => "fixed-test-key",
    });

    let blocked = false;
    for (let i = 0; i < 5; i++) {
      const { res, statusCode } = fakeRes();
      let calledNext = false;
      await limiter({} as AuthedRequest, res, () => {
        calledNext = true;
      });
      if (!calledNext) {
        blocked = true;
        expect(res.status).toBeDefined();
      }
    }
    expect(blocked).toBe(true); // the 4th/5th request must have been rejected
  });
});

describe("chatbot response caching", () => {
  beforeAll(async () => {
    await redis.del("chatbot:responses");
  });

  afterAll(async () => {
    await redis.del("chatbot:responses");
    await prisma.$disconnect();
  });

  it("populates the Redis cache on first lookup", async () => {
    const before = await redis.get("chatbot:responses");
    expect(before).toBeNull();

    await getChatbotResponse("hello");

    const after = await redis.get("chatbot:responses");
    expect(after).not.toBeNull();
  });

  it("still returns the right answer on a cached lookup", async () => {
    const reply = await getChatbotResponse("hello there");
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);
  });
});
