import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { verifyToken } from "../utils/jwt";
import { fail } from "../utils/response";

// Express's Request type doesn't know about our custom fields — extend it
// locally rather than mutating the global namespace everywhere.
export interface AuthedRequest extends Request {
  userId?: string;
  sessionToken?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return fail(res, 401, "UNAUTHENTICATED", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return fail(res, 401, "UNAUTHENTICATED", "Invalid or expired token");
  }

  // JWT signature alone doesn't let us revoke a token early (e.g. on logout).
  // The Session row is the source of truth for "is this token still active."
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    return fail(res, 401, "UNAUTHENTICATED", "Session expired or revoked");
  }

  req.userId = payload.userId;
  req.sessionToken = token;
  next();
}
