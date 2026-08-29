import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db";

// Unlike messages.test.ts (HTTP-level), this test talks to Prisma directly
// to prove the ATOMICITY claim in the README: if one write inside the
// transaction throws, none of the writes commit — not "the request failed",
// but "the database has zero rows from the attempt," verified by querying
// the table afterward.

describe("transaction atomicity", () => {
  const email = `atomicity-test-${Date.now()}@example.com`;
  let userId: string;
  let conversationId: string;

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }); // cascades
    await prisma.$disconnect();
  });

  it("rolls back ALL writes when one write in the transaction fails", async () => {
    const user = await prisma.user.create({
      data: { email, passwordHash: "irrelevant-for-this-test" },
    });
    userId = user.id;

    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: "Atomicity test" },
    });
    conversationId = conversation.id;

    const before = await prisma.message.count({ where: { conversationId } });

    // Force a failure partway through a transaction shaped like the real
    // send-message transaction: first write succeeds, second is designed
    // to violate a constraint (duplicate requestId), so we can prove the
    // FIRST write doesn't survive either.
    const sharedRequestId = `atomicity-${Date.now()}`;
    await prisma.message.create({
      data: { conversationId, sender: "USER", body: "first message", requestId: sharedRequestId },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.message.create({
          data: { conversationId, sender: "USER", body: "should not survive", requestId: "temp-unique-1" },
        });
        // This violates the @unique constraint on requestId (already used above)
        // and throws, aborting the transaction.
        await tx.message.create({
          data: { conversationId, sender: "BOT", body: "should also not survive", requestId: sharedRequestId },
        });
      })
    ).rejects.toThrow();

    const after = await prisma.message.count({ where: { conversationId } });
    // before(0) + 1 real message from the setup write = 1. The failed
    // transaction must have added exactly zero rows, not one.
    expect(after).toBe(before + 1);

    const orphan = await prisma.message.findFirst({ where: { body: "should not survive" } });
    expect(orphan).toBeNull();
  });
});
