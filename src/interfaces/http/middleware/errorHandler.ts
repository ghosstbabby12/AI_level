import { NextFunction, Request, Response } from "express";
import { AppError, ErrorKind } from "../../../application/errors";

const STATUS: Record<ErrorKind, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  unsupported: 415,
  unprocessable: 422,
  rate_limited: 429,
  unavailable: 503,
  failed: 500,
};

/** Use-case errors become JSON with their status; anything unexpected is logged and hidden. */
export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
    res.status(STATUS[error.kind]).json({ error: error.message, ...error.details });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Error interno. Intenta de nuevo." });
}
