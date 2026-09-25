import { Client } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "./errors";
import { AccessTokenPayload } from "./jwt";
import { logSecurityEvent } from "./securityLogger";

/**
 * Client Portal Permissions (2026-08-14). Kept deliberately separate from
 * `authorization.ts` — every helper there is built around staff `resolveViewScope`/
 * role-based tiers (ALL/ASSIGNED/OWN/NONE); a client's own access model has no tiers
 * at all, just a flat "is this literally your own row" check. Mixing the two would
 * force unused parameters into the staff helpers for no benefit.
 */

type PortalFlag = "portalCasesEnabled" | "portalHearingHistoryEnabled" | "portalDocumentsEnabled";

/** Re-reads the Client row fresh from the DB on every request rather than trusting
 * the JWT beyond "this is who is asking" — this is what makes a Managing Partner's
 * permission toggle (and a status change/soft-delete) take effect immediately, since
 * nothing about portal access is ever baked into the access token itself. */
export async function loadActiveClientActor(actor: AccessTokenPayload): Promise<Client> {
  const client = await prisma.client.findFirst({
    where: { id: actor.sub, deletedAt: null, status: "ACTIVE" },
  });
  if (!client) throw new UnauthorizedError("This account is no longer active");
  return client;
}

export function requirePortalFlag(client: Client, flag: PortalFlag, label: string): void {
  if (!client[flag]) {
    logSecurityEvent("PERMISSION_DENIED", {
      message: `Client attempted to access "${label}" while that portal permission is disabled`,
      actorId: client.id,
    });
    throw new ForbiddenError(`${label} is not enabled for your account`);
  }
}

/** Case ownership derived purely from the authenticated client's own id — never a
 * clientId supplied by the request. A case that exists but belongs to a different
 * client is a 404, identical to how assertCaseAccess treats an out-of-scope staff
 * request, so a foreign case's existence is never confirmed to this client. */
export async function assertClientOwnsCase(actor: AccessTokenPayload, caseId: string) {
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, deletedAt: null, clients: { some: { clientId: actor.sub } } },
  });
  if (!caseRecord) {
    const exists = await prisma.case.findFirst({ where: { id: caseId, deletedAt: null }, select: { id: true } });
    if (exists) {
      logSecurityEvent("PERMISSION_DENIED", {
        message: "Case exists but does not belong to this client",
        actorId: actor.sub,
        resourceType: "Case",
        resourceId: caseId,
      });
    }
    throw new NotFoundError("Case not found");
  }
  return caseRecord;
}
