import { Router } from "express";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { registerSchema, loginSchema } from "../schemas/auth.schema";
import { validate } from "../middleware/validate";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createRateLimiter } from "../middleware/rateLimiter";
import { ok, fail } from "../utils/response";

export const authRouter = Router();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — matches default JWT_EXPIRES_IN

// Tighter than the global limiter, specifically for credential-guessing
// protection. Keyed by IP since there's no authenticated user yet at login.
const authLimiter = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20),
  name: "auth",
  keyGenerator: (req) => req.ip ?? "unknown",
});

authRouter.post(
  "/auth/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, displayName } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(res, 409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });

    return ok(res, { user }, 201);
  })
);

authRouter.post(
  "/auth/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // Same error for "no such user" and "wrong password" — don't leak which one it was.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const token = signToken({ userId: user.id });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return ok(res, {
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  })
);

authRouter.post(
  "/auth/logout",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    // Deleting the Session row revokes the token immediately, even though
    // the JWT itself would still verify until it expires.
    await prisma.session.delete({ where: { token: req.sessionToken! } });
    return ok(res, { loggedOut: true });
  })
);

authRouter.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    if (!user) return fail(res, 404, "NOT_FOUND", "User not found");
    return ok(res, { user });
  })
);
