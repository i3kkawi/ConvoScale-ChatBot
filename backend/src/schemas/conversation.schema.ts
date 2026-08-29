import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(140),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});
