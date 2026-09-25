import { Request, Response, NextFunction } from "express";
import { sanitizeString } from "../utils/validators";

/**
 * Applied globally (app.ts, right after express.json()) so every request body — not
 * just ones a developer remembered to sanitize — has its strings trimmed and null
 * bytes stripped before any route-specific validation runs. This is defense-in-depth,
 * not a substitute for output encoding (React already escapes on render; Prisma
 * already parameterizes every query) — it just means malformed/junk whitespace and
 * embedded null bytes never reach business logic or storage in the first place.
 */
function deepSanitize(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = deepSanitize(entry);
    return out;
  }
  return value;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = deepSanitize(req.body);
  }
  next();
}
