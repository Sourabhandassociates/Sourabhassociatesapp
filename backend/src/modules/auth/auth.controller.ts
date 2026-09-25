import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { hashPassword } from "../../utils/password";
import { passwordSchema, parseBody } from "../../utils/validators";
import { recordAuditLog } from "../../utils/auditLog";
import * as authService from "./auth.service";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../../utils/errors";
import {
  isMobileClient,
  setRefreshCookie,
  clearRefreshCookie,
  refreshTokenFromCookie,
} from "../../utils/cookies";

const staffLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const clientLoginSchema = z.object({ clientId: z.string().min(1), password: z.string().min(1) });

function deviceInfoFrom(req: Request): string {
  return (req.body?.deviceLabel as string) || req.headers["user-agent"] || "unknown device";
}

/**
 * Web clients never get the refresh token in the response body — it's set as an
 * httpOnly cookie instead (utils/cookies.ts). Mobile clients (Phase 5) keep receiving
 * it in the body, since native apps don't share a browser's cookie jar the same way.
 */
function respondWithSession(
  req: Request,
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  extra: Record<string, unknown>
) {
  if (isMobileClient(req)) {
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, ...extra });
    return;
  }
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ accessToken: tokens.accessToken, ...extra });
}

export async function staffLogin(req: Request, res: Response) {
  const data = parseBody(staffLoginSchema, req.body);
  const result = await authService.loginStaff(data.email, data.password, deviceInfoFrom(req));
  if ("mfaRequired" in result) {
    res.json(result);
    return;
  }
  respondWithSession(req, res, result, { user: result.user, mfaSetupRequired: result.mfaSetupRequired });
}

const mfaLoginSchema = z.object({ mfaChallengeToken: z.string().min(1), code: z.string().min(1) });

export async function verifyMfaLogin(req: Request, res: Response) {
  const data = parseBody(mfaLoginSchema, req.body);
  const result = await authService.verifyMfaAndLogin(data.mfaChallengeToken, data.code, deviceInfoFrom(req));
  respondWithSession(req, res, result, { user: result.user, mfaSetupRequired: result.mfaSetupRequired });
}

export async function clientLogin(req: Request, res: Response) {
  const data = parseBody(clientLoginSchema, req.body);
  const result = await authService.loginClient(data.clientId, data.password, deviceInfoFrom(req));
  respondWithSession(req, res, result, { client: result.client });
}

/**
 * The access token is expired (that's why the caller is hitting /refresh), so it can't
 * be trusted to identify the session — sessionId/actorType travel in the body from
 * both platforms (neither is sensitive on its own). The refresh token itself comes
 * from the httpOnly cookie for web, or the body for mobile.
 */
const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  actorType: z.enum(["USER", "CLIENT"]),
});

export async function refresh(req: Request, res: Response) {
  const data = parseBody(refreshBodySchema, req.body);

  const refreshToken = isMobileClient(req) ? data.refreshToken : refreshTokenFromCookie(req);
  if (!refreshToken) throw new UnauthorizedError("No refresh token supplied");

  const tokens = await authService.refreshSession(data.actorType, data.sessionId, refreshToken);
  respondWithSession(req, res, tokens, {});
}

export async function logout(req: Request, res: Response) {
  if (!req.actor) throw new UnauthorizedError();
  await authService.logout(req.actor.actorType, req.actor.sessionId, req.actor.sub);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function forceLogoutUser(req: Request, res: Response) {
  await authService.forceLogoutUser(req.actor!, req.params.userId);
  res.status(204).send();
}

export async function mySessions(req: Request, res: Response) {
  if (!req.actor || req.actor.actorType !== "USER") {
    throw new ForbiddenError("Staff access only");
  }
  const sessions = await authService.listSessionsForUser(req.actor.sub);
  res.json(sessions);
}

/** SRD Section 9.4 — a user revoking one of their own other sessions (distinct from
 * the plain /logout, which only ever ends the current device's session). */
export async function revokeOwnSession(req: Request, res: Response) {
  if (!req.actor || req.actor.actorType !== "USER") {
    throw new ForbiddenError("Staff access only");
  }
  await authService.revokeOwnSession(req.actor.sub, req.params.sessionId);
  res.status(204).send();
}

/** SRD Section 9.4 — Managing Partner viewing any user's sessions before deciding to force-logout. */
export async function sessionsForAnyUser(req: Request, res: Response) {
  const sessions = await authService.listSessionsForAnyUser(req.params.userId);
  res.json(sessions);
}

/** Milestone 4 (SRD Section 28 — MFA) — step 1 of enrollment: generate secret + QR, nothing persisted yet. */
export async function beginMfaEnrollment(req: Request, res: Response) {
  if (!req.actor || req.actor.actorType !== "USER") throw new ForbiddenError("Staff access only");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.actor.sub } });
  const result = await authService.beginMfaEnrollment(req.actor.sub, user.email);
  res.json(result);
}

const confirmMfaSchema = z.object({ secret: z.string().min(1), code: z.string().min(1) });

export async function confirmMfaEnrollment(req: Request, res: Response) {
  if (!req.actor || req.actor.actorType !== "USER") throw new ForbiddenError("Staff access only");
  const data = parseBody(confirmMfaSchema, req.body);
  const result = await authService.confirmMfaEnrollment(req.actor.sub, data.secret, data.code);
  res.json(result);
}

const disableMfaSchema = z.object({ password: z.string().min(1) });

export async function disableMfa(req: Request, res: Response) {
  if (!req.actor || req.actor.actorType !== "USER") throw new ForbiddenError("Staff access only");
  const data = parseBody(disableMfaSchema, req.body);
  await authService.disableMfa(req.actor.sub, data.password);
  res.status(204).send();
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE", "OFFICE_STAFF", "ACCOUNTS_TEAM"]),
});

/** SRD Section 3.1 — only the Managing Partner creates staff accounts. */
export async function createUser(req: Request, res: Response) {
  const data = parseBody(createUserSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError("A user with this email already exists");

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash, role: data.role },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
  await recordAuditLog(req.actor!, "USER_CREATED", "User", user.id, {
    entityName: user.name,
    details: `role=${user.role}`,
  });
  res.status(201).json(user);
}

export async function staffDirectory(_req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
}

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
}

/** SRD Section 9.3(2) — disabling an account immediately ends all its active sessions. */
const setUserStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export async function setUserStatus(req: Request, res: Response) {
  const data = parseBody(setUserStatusSchema, req.body);

  /**
   * Step 3 — Managing Partner Safety (design doc Section 9.3), extended to account
   * deactivation, not just permission edits: the guarantee is "always at least one
   * active Managing Partner," so deactivating the last one is rejected here, the same
   * way Rule A/Rule B (coreAdminSafety.ts) reject the equivalent permission changes.
   */
  if (data.status === "INACTIVE") {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (target?.role === "MANAGING_PARTNER" && target.status === "ACTIVE") {
      const activePartners = await prisma.user.count({ where: { role: "MANAGING_PARTNER", status: "ACTIVE" } });
      if (activePartners <= 1) {
        throw new ForbiddenError("Cannot deactivate the last active Managing Partner account.");
      }
    }
  }

  const before = await prisma.user.findUnique({ where: { id: req.params.userId } });
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { status: data.status },
  });
  await recordAuditLog(req.actor!, "USER_STATUS_CHANGED", "User", user.id, {
    entityName: user.name,
    changes: { status: { old: before?.status ?? null, new: user.status } },
  });

  if (data.status === "INACTIVE") {
    await authService.revokeAllSessionsForDisabledAccount(user.id);
  }
  res.json({ id: user.id, status: user.status });
}
