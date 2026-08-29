import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/conversation.schema";
import { createMessageSchema, messageCursorQuerySchema } from "../schemas/message.schema";
import { getChatbotResponse } from "../utils/chatbot";
import { encodeCursor, decodeCursor } from "../utils/cursor";
import { asyncHandler } from "../middleware/errorHandler";
import { createRateLimiter } from "../middleware/rateLimiter";
import { ok, fail } from "../utils/response";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

// Stricter, per-user budget specifically for the expensive write path
// (each send does a transaction with 2 inserts + 1 update). Separate from
// the global IP-based limiter so browsing conversations doesn't eat into
// your message-sending budget, and one user's heavy usage doesn't affect
// another user sharing an IP (e.g. behind a NAT or office network).
const sendMessageLimiter = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.MESSAGE_RATE_LIMIT_MAX ?? 60),
  name: "send-message",
  keyGenerator: (req) => req.userId ?? "anonymous",
});

// Loads the conversation and 404s (not 403s) if it doesn't exist or isn't
// owned by the caller — same reasoning as conversations.ts.
async function loadOwnedConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.userId !== userId) return null;
  return conversation;
}

messagesRouter.post(
  "/conversations/:id/messages",
  sendMessageLimiter,
  validate(idParamSchema, "params"),
  validate(createMessageSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversationId = req.params.id;
    const { body, requestId } = req.body as { body: string; requestId?: string };

    const conversation = await loadOwnedConversation(conversationId, req.userId!);
    if (!conversation) return fail(res, 404, "NOT_FOUND", "Conversation not found");

    // --- Idempotency, checked BEFORE the transaction ---
    // If the client already sent this requestId (e.g. a retried network
    // request, or a double-clicked Send button), return the message that
    // was already created instead of creating a second one.
    if (requestId) {
      const existing = await prisma.message.findUnique({ where: { requestId } });
      if (existing) {
        const botReply = await prisma.message.findFirst({
          where: { conversationId, sender: "BOT", createdAt: { gte: existing.createdAt } },
          orderBy: { createdAt: "asc" },
        });
        return ok(res, { userMessage: existing, botMessage: botReply, deduplicated: true });
      }
    }

    // --- The atomic unit: user message + bot response + conversation
    // metadata all succeed together or all roll back together. ---
    try {
      const result = await prisma.$transaction(async (tx) => {
        const userMessage = await tx.message.create({
          data: { conversationId, sender: "USER", body, requestId },
        });

        // Chatbot lookup happens inside the transaction so the bot message's
        // createdAt is guaranteed to come after the user message's, which
        // matters for ordering (see GET below).
        const botText = await getChatbotResponse(body);
        const botMessage = await tx.message.create({
          data: { conversationId, sender: "BOT", body: botText },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: botMessage.createdAt },
        });

        return { userMessage, botMessage };
      });

      return ok(res, { userMessage: result.userMessage, botMessage: result.botMessage }, 201);
    } catch (err) {
      // A unique-constraint violation on requestId here means a second,
      // near-simultaneous request with the SAME requestId won the race
      // between our pre-check above and this transaction committing.
      // That's the real concurrency case (two requests arriving together,
      // not one-after-another) — handle it the same way: return the row
      // that actually got created instead of a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && requestId) {
        const existing = await prisma.message.findUnique({ where: { requestId } });
        if (existing) {
          const botReply = await prisma.message.findFirst({
            where: { conversationId, sender: "BOT", createdAt: { gte: existing.createdAt } },
            orderBy: { createdAt: "asc" },
          });
          return ok(res, { userMessage: existing, botMessage: botReply, deduplicated: true });
        }
      }
      throw err;
    }
  })
);

messagesRouter.get(
  "/conversations/:id/messages",
  validate(idParamSchema, "params"),
  validate(messageCursorQuerySchema, "query"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversationId = req.params.id;
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };

    const conversation = await loadOwnedConversation(conversationId, req.userId!);
    if (!conversation) return fail(res, 404, "NOT_FOUND", "Conversation not found");

    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) return fail(res, 400, "VALIDATION_ERROR", "Invalid cursor");

    // Keyset pagination: newest-first, page by (createdAt, id) instead of
    // OFFSET so page N is a single indexed lookup regardless of N — no
    // "scan and discard the first 10,000 rows" cost as history grows.
    const where: Prisma.MessageWhereInput = { conversationId };
    if (decoded) {
      where.OR = [
        { createdAt: { lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
      ];
    }

    const rows = await prisma.message.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // fetch one extra to know whether there's a next page
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

    return res.status(200).json({
      success: true,
      data: page,
      pagination: { limit, nextCursor },
    });
  })
);
