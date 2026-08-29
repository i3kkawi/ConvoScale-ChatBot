import { Response } from "express";

export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function okPaginated(
  res: Response,
  data: unknown,
  pagination: { limit: number; offset: number; total: number },
  status = 200
) {
  return res.status(status).json({ success: true, data, pagination });
}

export function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, error: { code, message } });
}
