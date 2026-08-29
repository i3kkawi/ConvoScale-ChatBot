import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Fail loudly at startup rather than silently signing with "undefined".
  throw new Error("JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.");
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export interface JwtPayload {
  userId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET as string, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET as string) as JwtPayload;
}
