import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { comparePassword } from "../../utils/password";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  ActorType,
} from "../../utils/jwt";
import { UnauthorizedError, ForbiddenError } from "../../utils/errors";
import { logSecurityEvent } from "../../utils/securityLogger";
import { recordAuditLog } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";
import {
  generateTotpSecret,
  generateProvisioningQrCode,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  consumeBackupCode,
} from "../../utils/mfa";

/** SRD Section 28 — "MFA (mandatory for Partner/Accounts)". */
const MFA_MANDATORY_ROLES: UserRole[] = ["MANAGING_PARTNER", "ACCOUNTS_TEAM"];

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(
  actorType: ActorType,
  actorId: string,
  role: string,
  sessionId: string
): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: actorId, actorType, role, sessionId });
  const refreshToken = generateRefreshToken();
  return { accessToken, refreshToken };
}

async function createStaffSessionAndTokens(
  user: { id: string; name: string; email: string; role: UserRole; mfaEnabled: boolean },
  deviceInfo: string
) {
  const session = await prisma.userSession.create({
    data: { userId: user.id, deviceInfo, refreshTokenHash: "" },
  });
  const tokens = await issueTokens("USER", user.id, user.role, session.id);
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashRefreshToken(tokens.refreshToken) },
  });

  await recordAuditLog({ sub: user.id, role: user.role }, "AUTH_LOGIN_SUCCESS", "User", user.id, {
    entityName: user.name,
    sessionId: session.id,
  });

  return {
    ...tokens,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    /** SRD Section 28 — nudges a Partner/Accounts user who hasn't enrolled yet into
     * the mandatory MFA setup flow. Deliberately does not block this login itself
     * (see the module-level scope note in mfa.ts's SRD doc comment / CHANGELOG) —
     * they need a working session to reach the enrollment screen in the first place.
     * Only true when MFA is actually mandatory for this role AND not yet enabled —
     * once enrolled, the nudge must stop, not follow them on every future login. */
    mfaSetupRequired: MFA_MANDATORY_ROLES.includes(user.role) && !user.mfaEnabled,
  };
}

/** SRD Section 3.1-3.5 + Section 9 — staff login (email/password), extended in
 * Milestone 4 with an MFA challenge step (SRD Section 28) when the account has MFA
 * enabled: password verification succeeds here, but no session is issued yet — the
 * caller must complete `verifyMfaAndLogin` with a valid TOTP/backup code first. */
export async function loginStaff(email: string, password: string, deviceInfo: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    const reason = !user ? "no-such-user" : "account-inactive";
    logSecurityEvent("AUTH_LOGIN_FAILURE", { message: "Staff login failed", email, reason });
    await recordAuditLog({ sub: user?.id ?? null, role: user?.role }, "AUTH_LOGIN_FAILURE", "User", user?.id, {
      entityName: email,
      details: reason,
    });
    throw new UnauthorizedError("Invalid email or password");
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    logSecurityEvent("AUTH_LOGIN_FAILURE", {
      message: "Staff login failed",
      email,
      actorId: user.id,
      reason: "wrong-password",
    });
    await recordAuditLog({ sub: user.id, role: user.role }, "AUTH_LOGIN_FAILURE", "User", user.id, {
      entityName: email,
      details: "wrong-password",
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.mfaEnabled) {
    return { mfaRequired: true as const, mfaChallengeToken: signMfaChallengeToken(user.id) };
  }

  return createStaffSessionAndTokens(user, deviceInfo);
}

/** Second step of login when `loginStaff` returned `mfaRequired`. */
export async function verifyMfaAndLogin(mfaChallengeToken: string, code: string, deviceInfo: string) {
  let userId: string;
  try {
    userId = verifyMfaChallengeToken(mfaChallengeToken).sub;
  } catch {
    throw new UnauthorizedError("MFA challenge has expired — please log in again");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || !user.mfaEnabled || !user.mfaSecretEncrypted) {
    throw new UnauthorizedError("MFA challenge is no longer valid — please log in again");
  }

  const secret = decryptSecret(user.mfaSecretEncrypted);
  const codeValid = verifyTotpCode(secret, code);
  if (codeValid) {
    return createStaffSessionAndTokens(user, deviceInfo);
  }

  const remainingCodes = await consumeBackupCode(user.mfaBackupCodesHashed, code);
  if (remainingCodes) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodesHashed: remainingCodes } });
    logSecurityEvent("AUTH_MFA_BACKUP_CODE_USED", { message: "MFA backup code consumed", actorId: user.id });
    return createStaffSessionAndTokens(user, deviceInfo);
  }

  logSecurityEvent("AUTH_MFA_FAILURE", { message: "Invalid MFA code", actorId: user.id });
  await recordAuditLog({ sub: user.id, role: user.role }, "AUTH_LOGIN_FAILURE", "User", user.id, {
    entityName: user.name,
    details: "invalid-mfa-code",
  });
  throw new UnauthorizedError("Invalid authentication code");
}

/** Step 1 of enrollment — generates a secret and QR code, but doesn't persist or
 * enable anything yet (confirmed by `confirmMfaEnrollment` verifying a real code
 * against it first, so a typo'd/abandoned enrollment never silently half-enables MFA). */
export async function beginMfaEnrollment(userId: string, email: string) {
  const secret = generateTotpSecret();
  const qrCodeDataUrl = await generateProvisioningQrCode(email, secret);
  return { secret, qrCodeDataUrl };
}

export async function confirmMfaEnrollment(userId: string, secret: string, code: string) {
  if (!verifyTotpCode(secret, code)) {
    throw new UnauthorizedError("Invalid authentication code — check your authenticator app and try again");
  }
  const { plain, hashed } = await generateBackupCodes();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaSecretEncrypted: encryptSecret(secret), mfaBackupCodesHashed: hashed },
  });
  await recordAuditLog({ sub: userId, role: user.role }, "AUTH_MFA_ENABLED", "User", userId, { entityName: user.name });
  return { backupCodes: plain };
}

/** Disabling requires the current password (re-authentication for a security-relevant
 * change), matching the same "prove you're still you" bar a password change would need. */
export async function disableMfa(userId: string, currentPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new ForbiddenError("Incorrect password");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaBackupCodesHashed: [] },
  });
  await recordAuditLog({ sub: userId, role: user.role }, "AUTH_MFA_DISABLED", "User", userId, { entityName: user.name });
}

/** SRD Section 3.6 + Section 11.1 — client login via Client ID instead of email. */
export async function loginClient(clientId: string, password: string, deviceInfo: string) {
  const client = await prisma.client.findUnique({ where: { clientId } });
  // Step 2 — Soft Delete & Recycle Bin: a soft-deleted client is treated identically to
  // a non-existent one for login purposes, same as every other normal-access path.
  if (!client || client.deletedAt || client.status !== "ACTIVE") {
    logSecurityEvent("AUTH_LOGIN_FAILURE", {
      message: "Client login failed",
      clientId,
      reason: !client || client.deletedAt ? "no-such-client" : "account-inactive",
    });
    throw new UnauthorizedError("Invalid Client ID or password");
  }
  const valid = await comparePassword(password, client.passwordHash);
  if (!valid) {
    logSecurityEvent("AUTH_LOGIN_FAILURE", {
      message: "Client login failed",
      clientId,
      actorId: client.id,
      reason: "wrong-password",
    });
    throw new UnauthorizedError("Invalid Client ID or password");
  }

  const session = await prisma.clientSession.create({
    data: { clientId: client.id, deviceInfo, refreshTokenHash: "" },
  });
  const tokens = await issueTokens("CLIENT", client.id, "CLIENT", session.id);
  await prisma.clientSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashRefreshToken(tokens.refreshToken) },
  });

  return {
    ...tokens,
    client: { id: client.id, clientId: client.clientId, name: client.name },
  };
}

/** SRD Section 9.2 — silent background refresh; rotates the refresh token on each use. */
export async function refreshSession(actorType: ActorType, sessionId: string, refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);

  if (actorType === "USER") {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.status !== "ACTIVE" || session.refreshTokenHash !== hash) {
      logSecurityEvent("AUTH_REFRESH_FAILURE", { message: "Refresh rejected", actorType, sessionId });
      throw new UnauthorizedError("Session is no longer valid — please log in again");
    }
    if (session.user.status !== "ACTIVE") {
      logSecurityEvent("AUTH_ACCOUNT_DISABLED_LOGIN_ATTEMPT", {
        message: "Refresh attempted for disabled account",
        actorId: session.userId,
        sessionId,
      });
      throw new UnauthorizedError("Account has been disabled");
    }
    const tokens = await issueTokens("USER", session.userId, session.user.role, session.id);
    await prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashRefreshToken(tokens.refreshToken), lastActiveAt: new Date() },
    });
    return tokens;
  }

  const session = await prisma.clientSession.findUnique({
    where: { id: sessionId },
    include: { client: true },
  });
  if (!session || session.status !== "ACTIVE" || session.refreshTokenHash !== hash) {
    logSecurityEvent("AUTH_REFRESH_FAILURE", { message: "Refresh rejected", actorType, sessionId });
    throw new UnauthorizedError("Session is no longer valid — please log in again");
  }
  if (session.client.status !== "ACTIVE") {
    logSecurityEvent("AUTH_ACCOUNT_DISABLED_LOGIN_ATTEMPT", {
      message: "Refresh attempted for disabled client account",
      actorId: session.clientId,
      sessionId,
    });
    throw new UnauthorizedError("Account has been disabled");
  }
  const tokens = await issueTokens("CLIENT", session.clientId, "CLIENT", session.id);
  await prisma.clientSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashRefreshToken(tokens.refreshToken), lastActiveAt: new Date() },
  });
  return tokens;
}

/** SRD Section 9.3(1) + 9.4 — logout current device only. `actorId` is only meaningful
 * for a USER actor — a Client logout has no corresponding User row to attribute an
 * AuditLog entry to (AuditLog.userId's FK only ever targets User, per its schema doc
 * comment), so it's simply omitted for CLIENT logouts, same as every other audited
 * security action in this file. */
export async function logout(actorType: ActorType, sessionId: string, actorId?: string) {
  if (actorType === "USER") {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { status: "REVOKED", revokedReason: "user-logout" },
    });
    if (actorId) {
      await recordAuditLog({ sub: actorId }, "AUTH_LOGOUT", "Session", sessionId);
    }
  } else {
    await prisma.clientSession.update({
      where: { id: sessionId },
      data: { status: "REVOKED", revokedReason: "user-logout" },
    });
  }
}

/** SRD Section 9.4 — Managing Partner force logout across all of a user's devices. */
export async function forceLogoutUser(actor: AccessTokenPayload, userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedReason: "admin-forced" },
  });
  await recordAuditLog(actor, "AUTH_FORCE_LOGOUT", "User", userId);
}

/** SRD Section 9.3(3) — password change invalidates every existing session for that user. */
export async function revokeAllSessionsForPasswordChange(userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedReason: "password-change" },
  });
}

/** SRD Section 9.3(2) — disabling an account revokes all of its active sessions. */
export async function revokeAllSessionsForDisabledAccount(userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedReason: "account-disabled" },
  });
}

export async function listSessionsForUser(userId: string) {
  return prisma.userSession.findMany({
    where: { userId },
    orderBy: { lastActiveAt: "desc" },
    select: {
      id: true,
      deviceInfo: true,
      status: true,
      createdAt: true,
      lastActiveAt: true,
      revokedReason: true,
    },
  });
}

/** SRD Section 9.4 — Managing Partner can view any user's sessions (not just force
 * logout blind) before deciding whether to revoke them, gated by SESSIONS.VIEW_ANY. */
export async function listSessionsForAnyUser(userId: string) {
  return listSessionsForUser(userId);
}

/** SRD Section 9.4 — "Users can view their own sessions and log out of the current
 * device" implies logging out a *specific* one of their own other devices too, not
 * only the one they're currently on (that's the plain `/logout` endpoint already
 * covers). Scoped to the caller's own sessions only — this is not the admin
 * force-logout-all path. */
export async function revokeOwnSession(userId: string, sessionId: string) {
  const session = await prisma.userSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new ForbiddenError("Not your session");
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { status: "REVOKED", revokedReason: "user-logout" },
  });
  await recordAuditLog({ sub: userId }, "AUTH_SESSION_REVOKED", "Session", sessionId, { details: "user-initiated" });
}
