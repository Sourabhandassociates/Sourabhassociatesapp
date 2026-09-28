import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

export type ActorType = "USER" | "CLIENT";

export interface AccessTokenPayload {
  sub: string;
  actorType: ActorType;
  role: string;
  sessionId: string;
}

/**
 * Step 3 — Enterprise Role & Permission Management. The runtime `req.actor` shape
 * once `middleware/permissions.ts`'s `attachEffectivePermissions` has populated it —
 * a superset of the raw JWT payload, never itself signed into a token (deliberately
 * kept as a separate type from `AccessTokenPayload` rather than adding the field
 * there, so a `Set` can never accidentally end up inside `jwt.sign()`'s input).
 * Every existing function typed `actor: AccessTokenPayload` continues to accept this
 * unchanged (structural typing — one optional extra field is always compatible), so
 * introducing this type requires no changes to any pre-existing signature.
 */
export interface AuthorizedActor extends AccessTokenPayload {
  effectivePermissions?: Set<string>;
}

// @types/jsonwebtoken types `expiresIn` as a branded literal ("15m", "30d", ...),
// not a general `string` — but ours legitimately comes from an env var read at
// runtime, so TypeScript can't prove the literal shape. The env module already
// validates these are present at startup (config/env.ts); this cast just bridges
// a real runtime string to the library's narrower compile-time type.
const ACCESS_TOKEN_OPTIONS: SignOptions = { expiresIn: env.jwtAccessExpiresIn as SignOptions["expiresIn"] };

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, ACCESS_TOKEN_OPTIONS);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings (not JWTs) — only their hash is stored
 * server-side (UserSession/ClientSession.refreshTokenHash), so a leaked DB row
 * alone can't be replayed as a valid token. SRD Section 9.2.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Milestone 4 (Version 1.0 completion, SRD Section 28 — MFA). A short-lived,
 * single-purpose token issued after password verification succeeds but before MFA
 * verification completes — proves "this caller already knows the password for this
 * account" without yet granting a real session. Deliberately not an `AccessTokenPayload`
 * (no `sessionId`/no permission-bearing shape) so it can never be mistaken for one by
 * `requireAuth`, which only ever verifies/consumes `AccessTokenPayload`-shaped tokens.
 */
export interface MfaChallengeTokenPayload {
  sub: string;
  purpose: "mfa_challenge";
}

const MFA_CHALLENGE_OPTIONS: SignOptions = { expiresIn: "5m" };

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa_challenge" }, env.jwtAccessSecret, MFA_CHALLENGE_OPTIONS);
}

export function verifyMfaChallengeToken(token: string): MfaChallengeTokenPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as MfaChallengeTokenPayload;
  if (payload.purpose !== "mfa_challenge") {
    throw new Error("Not an MFA challenge token");
  }
  return payload;
}
