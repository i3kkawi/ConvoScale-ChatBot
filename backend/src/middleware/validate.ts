import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { fail } from "../utils/response";

type Part = "body" | "query" | "params";

export function validate(schema: ZodSchema, part: Part = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      return fail(res, 400, "VALIDATION_ERROR", message);
    }
    // Replace with the parsed (coerced/trimmed/defaulted) value.
    (req as any)[part] = result.data;
    next();
  };
}
