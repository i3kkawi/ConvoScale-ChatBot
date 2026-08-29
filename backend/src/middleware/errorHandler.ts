import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/response";

// Wrap async route handlers so thrown/rejected errors reach this handler
// instead of crashing the process or hanging the request.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Must be registered LAST, after all routes.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);
  fail(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}
