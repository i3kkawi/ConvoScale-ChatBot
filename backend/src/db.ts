import { PrismaClient } from "@prisma/client";

// Singleton so we reuse one connection pool across the app instead of
// opening a new pool per request (see README: connection pooling).
export const prisma = new PrismaClient();
