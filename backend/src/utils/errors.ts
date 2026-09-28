/**
 * Typed errors that the shared errorHandler middleware knows how to render safely.
 * Anything NOT an AppError is treated as unexpected: logged in full server-side,
 * but reported to the client as a generic message (no internal detail leakage).
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Optional structured payload the errorHandler forwards alongside `message` —
     * e.g. the conflict-match list on ConflictCheckError. Undefined for every other
     * error type, so the response shape for those is unchanged. */
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request") {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

/**
 * Milestone 1 (SRD Section 10.2 — Advanced Conflict Check). Carries the possible-match
 * list so the caller can render a specific warning instead of a generic 409 message.
 */
export class ConflictCheckError extends AppError {
  constructor(
    message: string,
    public readonly matches: unknown
  ) {
    super(message, 409, matches);
  }
}
