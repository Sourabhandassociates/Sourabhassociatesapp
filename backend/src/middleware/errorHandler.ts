import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { AppError } from "../utils/errors";

/**
 * Known, typed errors (AppError subclasses) are safe to show to the client — they're
 * thrown deliberately with a message written for the caller. Anything else is an
 * unexpected failure (a bug, a raw Prisma/driver error, etc.): log it in full for
 * debugging, but never forward its message to the client — it can contain internal
 * details (table/constraint names, file paths, stack fragments).
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) });
  }

  // Multer's own errors (file too large, too many files, unexpected field, etc.) are a
  // request-validation problem, not a server fault — worth their own client-safe 400,
  // same reasoning as AppError, rather than falling into the generic 500 below.
  if (err instanceof MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
