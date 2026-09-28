import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { env } from "../config/env";
import { logSecurityEvent, requestContext } from "../utils/securityLogger";

function onLimitReached(req: Request, res: Response) {
  logSecurityEvent("RATE_LIMIT_EXCEEDED", {
    message: `Rate limit exceeded for ${req.method} ${req.path}`,
    ...requestContext(req),
  });
  res.status(429).json({ error: "Too many requests. Please try again later." });
}

/**
 * The automated test suite (backend/tests) makes dozens of rapid requests per file
 * against these same endpoints by design — that's not abuse, it's the point of the
 * suite, so rate limiting is disabled under NODE_ENV=test rather than tuned around it.
 */
const isTestEnv = env.nodeEnv === "test";

/** General ceiling across the whole API — abuse/DoS protection, not a feature limit. */
export const generalRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  handler: onLimitReached,
});

/** Tight ceiling on credential-guessing endpoints specifically. */
export const authRateLimit = rateLimit({
  windowMs: env.rateLimit.authWindowMs,
  limit: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  handler: onLimitReached,
});
