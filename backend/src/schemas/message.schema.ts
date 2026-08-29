import { z } from "zod";

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Message body cannot be empty").max(4000),
  // Client-generated idempotency key. Same requestId sent twice must not
  // create two messages — see routes/messages.ts.
  requestId: z.string().trim().min(1).max(100).optional(),
});

export const messageCursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Opaque cursor from a previous response's `pagination.nextCursor`.
  cursor: z.string().trim().min(1).optional(),
});
