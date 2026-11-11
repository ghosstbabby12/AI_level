/**
 * Errors a use case raises on purpose, with a message for the user. The HTTP layer maps
 * each kind to a status code; anything else is an unexpected 500.
 */
export type ErrorKind =
  | "invalid" // 400
  | "unauthorized" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "conflict" // 409
  | "too_large" // 413
  | "unsupported" // 415
  | "unprocessable" // 422
  | "rate_limited" // 429
  | "unavailable" // 503
  | "failed"; // 500

export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    /** Extra JSON fields for the client (field, code, limit...). */
    readonly details: Record<string, unknown> = {},
    /** Seconds the client should wait before retrying. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** Shortcut for the common "this value is wrong" case, pointing at the form field. */
export const invalid = (message: string, field?: string) => new AppError("invalid", message, field ? { field } : {});

/** An error whose message is meant for the user (e.g. why the AI could not write a game). */
export class UserFacingError extends Error {
  /** Technical detail for the logs (the message is what the user reads). */
  constructor(message: string, readonly detail?: string) {
    super(message);
  }
}

/** Raised by the user repository when the email UNIQUE constraint fails. */
export class EmailTakenError extends Error {}
