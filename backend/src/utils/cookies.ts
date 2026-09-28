import { Request, Response } from "express";
import { env } from "../config/env";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Dual token-delivery strategy (SRD Section 25.2 — one backend, multiple clients):
 *
 * - Web Admin Portal: the refresh token is never present in a JSON response body at
 *   all. It's set as an httpOnly, Secure (in production), SameSite cookie instead, so
 *   client-side JavaScript — including an XSS payload — cannot read it. Only the
 *   short-lived access token is JS-visible, which is the accepted trade-off (small
 *   blast radius given its ~15 minute lifetime).
 * - Mobile apps (Phase 5, not yet built): native apps don't participate in a browser's
 *   cookie jar the same way, so they continue to receive the refresh token in the JSON
 *   body and are expected to store it in the platform's secure storage (Keychain/
 *   Keystore per SRD Section 25.3) — that's still an appropriate secure strategy for
 *   that platform, just a different mechanism than a cookie.
 *
 * A request identifies itself as mobile via `X-Client-Platform: mobile`. Anything else
 * (including no header at all) is treated as web — the safer default, since the only
 * client that exists today (the Web Admin Portal) never sends this header.
 */
export function isMobileClient(req: Request): boolean {
  return req.headers["x-client-platform"] === "mobile";
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.cookieSameSite,
    path: "/api/auth", // only sent to auth endpoints — narrows both accidental leakage and CSRF surface
    maxAge: THIRTY_DAYS_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.cookieSameSite,
    path: "/api/auth",
  });
}

export function refreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[env.refreshCookieName];
}
