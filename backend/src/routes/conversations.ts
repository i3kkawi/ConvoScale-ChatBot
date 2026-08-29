import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createConversationSchema,
  updateConversationSchema,
  paginationQuerySchema,
  idParamSchema,
} from "../schemas/conversation.schema";
import { asyncHandler } from "../middleware/errorHandler";
import { ok, okPaginated, fail } from "../utils/response";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.post(
  "/conversations",
  validate(createConversationSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversation = await prisma.conversation.create({
      data: { userId: req.userId!, title: req.body.title },
    });
    return ok(res, { conversation }, 201);
  })
);

conversationsRouter.get(
  "/conversations",
  validate(paginationQuerySchema, "query"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };

    // Two queries (page + count) rather than one N+1-prone query per conversation.
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: req.userId! },
        orderBy: { lastMessageAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.conversation.count({ where: { userId: req.userId! } }),
    ]);

    return okPaginated(res, conversations, { limit, offset, total });
  })
);

conversationsRouter.get(
  "/conversations/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    // 404 (not 403) whether the row doesn't exist or belongs to someone else —
    // this avoids leaking which conversation IDs exist to other users.
    if (!conversation || conversation.userId !== req.userId) {
      return fail(res, 404, "NOT_FOUND", "Conversation not found");
    }

    return ok(res, { conversation });
  })
);

conversationsRouter.patch(
  "/conversations/:id",
  validate(idParamSchema, "params"),
  validate(updateConversationSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return fail(res, 404, "NOT_FOUND", "Conversation not found");
    }

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { title: req.body.title },
    });
    return ok(res, { conversation });
  })
);

conversationsRouter.delete(
  "/conversations/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return fail(res, 404, "NOT_FOUND", "Conversation not found");
    }

    await prisma.conversation.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);
