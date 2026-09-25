import { z } from "zod";
import { BadRequestError } from "./errors";

/**
 * SRD Section 28 — "password policy: minimum complexity." Applies to staff account
 * creation (Managing-Partner-set passwords). Client passwords are system-generated
 * high-entropy random strings (Section 11.1), not user-chosen, so complexity rules
 * don't apply the same way there — what matters for those is entropy, not shape.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must include at least one special character");

/**
 * Trims a string and rejects null bytes — a lightweight, functionality-preserving
 * input-sanitization step applied at the validation layer (utils/validate.ts), not a
 * substitute for output encoding (React already escapes on render; Prisma already
 * parameterizes queries).
 */
export function sanitizeString(value: string): string {
  return value.replace(/\0/g, "").trim();
}

/**
 * Single, centralized entry point for validating a request body against a Zod schema
 * — every controller uses this instead of hand-rolling its own
 * `safeParse` + `if (!success) throw ...` boilerplate, so there's exactly one place
 * that decides how a validation failure is reported to the client.
 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  return parsed.data;
}
