import path from "path";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AccessTokenPayload } from "../../utils/jwt";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../utils/errors";
import { hashPassword, comparePassword } from "../../utils/password";
import { recordAuditLog } from "../../utils/auditLog";
import {
  loadActiveClientActor,
  requirePortalFlag,
  assertClientOwnsCase,
} from "../../utils/clientPortalAuthorization";

/**
 * Client Portal Permissions (2026-08-14). Every function here is read-only and
 * scoped entirely by the authenticated client's own id (`actor.sub`) — no function
 * in this file ever accepts or trusts a client id from the request. This is the
 * client-facing counterpart to the Managing-Partner-facing write path in
 * `clients.service.ts`'s `updatePortalPermissions`.
 */


/** Clients may update their own display name and password only. Password changes
 * require the current password and invalidate all active portal sessions. */
export async function updateMyProfile(
  actor: AccessTokenPayload,
  input: { name?: string; currentPassword?: string; newPassword?: string },
) {
  const client = await loadActiveClientActor(actor);
  const name = input.name?.trim();
  const newPassword = input.newPassword;

  if (!name && !newPassword) {
    throw new BadRequestError("Enter a new name or password");
  }
  if (name && name.length > 120) {
    throw new BadRequestError("Name must be 120 characters or fewer");
  }
  if (newPassword) {
    if (newPassword.length < 8) {
      throw new BadRequestError("New password must be at least 8 characters");
    }
    if (!input.currentPassword) {
      throw new BadRequestError("Enter your current password to change it");
    }
    const valid = await comparePassword(input.currentPassword, client.passwordHash);
    if (!valid) throw new ForbiddenError("Current password is incorrect");
  }

  const data: { name?: string; passwordHash?: string } = {};
  if (name && name !== client.name) data.name = name;
  if (newPassword) data.passwordHash = await hashPassword(newPassword);

  if (Object.keys(data).length === 0) {
    throw new BadRequestError("No profile changes to save");
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data,
    select: { id: true, clientId: true, name: true },
  });

  if (newPassword) {
    await prisma.clientSession.updateMany({
      where: { clientId: client.id, status: "ACTIVE" },
      data: { status: "REVOKED" },
    });
  }

  await recordAuditLog(actor, "CLIENT_PORTAL_PROFILE_UPDATED", "Client", client.id, {
    entityName: updated.clientId,
    details: `${data.name ? "Name updated" : ""}${data.name && newPassword ? "; " : ""}${newPassword ? "Password changed" : ""}`,
  });

  return { ...updated, passwordChanged: Boolean(newPassword) };
}

export async function getMyProfile(actor: AccessTokenPayload) {
  const client = await loadActiveClientActor(actor);
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    newname: client.newname,
    email: client.email,
    phone: client.phone,
    address: client.address,
    permissions: {
      cases: client.portalCasesEnabled,
      hearingHistory: client.portalHearingHistoryEnabled,
      documents: client.portalDocumentsEnabled,
    },
  };
}

// export async function listMyCases(actor: AccessTokenPayload) {
//   const client = await loadActiveClientActor(actor);
//   requirePortalFlag(client, "portalCasesEnabled", "List of Cases");

//   const links = await prisma.caseClient.findMany({
//     where: {
//       clientId: client.id,
//       case: { deletedAt: null },
//     },
//     include: {
//       case: {
//         select: {
//           id: true,
//           matterNumber: true,
//           caseType: true,
//           courtCaseNumber: true,
//           title: true,
//           status: true,
//           stage: true,
//           filingDate: true,
//           courtName: true,
//           courtNumber: true,
//         },
//       },
//     },
//     orderBy: {
//       case: { createdAt: "desc" },
//     },
//   });

//   return links.map((link) => ({
//     partyRole: link.partyRole,
//     case: link.case,
//   }));
// }

export async function listMyCases(actor: AccessTokenPayload) {
  const client = await loadActiveClientActor(actor);

  requirePortalFlag(client, "portalCasesEnabled", "List of Cases");

  const links = await prisma.caseClient.findMany({
    where: {
      clientId: client.id,
      case: {
        deletedAt: null,
      },
    },
    include: {
      case: {
        select: {
          id: true,
          matterNumber: true,
          bundleNumber: true,
          caseType: true,
          courtCaseNumber: true,
          title: true,
          status: true,
          stage: true,
          filingDate: true,
          courtName: true,
          courtNumber: true,
        },
      },
    },
    orderBy: {
      case: {
        createdAt: "desc",
      },
    },
  });

  // DEBUG: Check actual database response
console.log(
  "CLIENT PORTAL CASES FROM DATABASE:",
  JSON.stringify(links, null, 2)
);

  return links.map((link) => ({
    partyRole: link.partyRole,
    case: {
      ...link.case,
      // Keep the client portal response shape stable even for legacy records.
      caseType: link.case.caseType ?? null,
      courtCaseNumber: link.case.courtCaseNumber ?? null,
      courtNumber: link.case.courtNumber ?? null,
      courtName: link.case.courtName ?? null,
    },
  }));
}

// export async function getMyCase(actor: AccessTokenPayload, caseId: string) {
//   const client = await loadActiveClientActor(actor);
//   requirePortalFlag(client, "portalCasesEnabled", "List of Cases");
//   await assertClientOwnsCase(actor, caseId);

//   return prisma.case.findUniqueOrThrow({
//     where: { id: caseId },
//     select: {
//       id: true,
//       matterNumber: true,
//       title: true,
//       status: true,
//       stage: true,
//       caseType: true,
//       filingDate: true,
//       courtName: true,
//       courtNumber: true,
//       courtCaseNumber: true,
//       jurisdiction: true,
//       department: true,
//     },
//   });
// }

export async function getMyCase(actor: AccessTokenPayload, caseId: string) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalCasesEnabled", "List of Cases");
  await assertClientOwnsCase(actor, caseId);

  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      id: true,
      matterNumber: true,
      bundleNumber: true,
      title: true,
      practiceArea: true,
      status: true,
      stage: true,
      caseType: true,
      filingDate: true,
      courtName: true,
      courtNumber: true,
      courtCaseNumber: true,
      jurisdiction: true,
      department: true,
      description: true,
      oppositeCounsel: true,
      oppositeParty: true,
    },
  });

  const nextHearing = await prisma.hearing.findFirst({
    where: { caseId, status: "SCHEDULED" },
    orderBy: { hearingDate: "asc" },
    select: { hearingDate: true },
  });

  return {
    ...caseData,
    nextHearingDate: nextHearing?.hearingDate ?? null,
  };
}

/** caseId is optional — omitted, this returns hearings across every one of the
 * client's own cases (powers the Dashboard's flat Hearing History section);
 * supplied, it's additionally re-verified as belonging to this client (never
 * trusting the query param alone). Independent of portalCasesEnabled by design —
 * the three toggles are independent per the spec. */
export async function listMyHearings(actor: AccessTokenPayload, caseId?: string) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalHearingHistoryEnabled", "Hearing History");

  if (caseId) {
    await assertClientOwnsCase(actor, caseId);
  }

  return prisma.hearing.findMany({
    where: {
      case: { deletedAt: null, clients: { some: { clientId: client.id } } },
      ...(caseId ? { caseId } : {}),
    },
    select: {
      id: true,
      caseId: true,
      hearingDate: true,
      courtName: true,
      courtHall: true,
      judgeName: true,
      purpose: true,
      outcomeNotes: true,
      status: true,
      case: {
        select: {
          matterNumber: true,
          bundleNumber: true,
          title: true,
          caseType: true,
          courtCaseNumber: true,
          courtNumber: true,
          courtName: true,
          stage: true,
          status: true,
        },
      },
    },
    orderBy: { hearingDate: "desc" },
  });
}

/** Same optional-caseId shape as listMyHearings. The `confidentiality:
 * "CLIENT_VISIBLE"` clause is the second of the spec's three mandatory
 * conditions, enforced in the query itself rather than filtered after the fact —
 * an INTERNAL document in the client's own case is structurally invisible here,
 * never merely hidden by the frontend. */
export async function listMyDocuments(actor: AccessTokenPayload, caseId?: string) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalDocumentsEnabled", "Documents");

  if (caseId) {
    await assertClientOwnsCase(actor, caseId);
  }

  return prisma.document.findMany({
    where: {
      deletedAt: null,
      confidentiality: "CLIENT_VISIBLE",
      case: { deletedAt: null, clients: { some: { clientId: client.id } } },
      ...(caseId ? { caseId } : {}),
    },
    select: {
      id: true,
      caseId: true,
      title: true,
      category: true,
      createdAt: true,
      case: { select: { matterNumber: true, title: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true, fileName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Resolves the file for the latest version of a document, enforcing all three of
 * the spec's mandatory conditions (Documents permission ON, CLIENT_VISIBLE, own
 * case) in a single query's where-clause — not found (any condition false) is a
 * 404, matching documents.service.ts's getDownloadInfo's existing "never confirm
 * existence" convention. Only the latest version is ever exposed to a client — no
 * version history, matching this feature's minimal read-only scope. */
export async function getMyDocumentDownload(actor: AccessTokenPayload, documentId: string) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalDocumentsEnabled", "Documents");

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      confidentiality: "CLIENT_VISIBLE",
      case: { deletedAt: null, clients: { some: { clientId: client.id } } },
    },
    select: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { storagePath: true, fileName: true },
      },
    },
  });
  const version = document?.versions[0];
  if (!version) throw new NotFoundError("Document not found");

  return {
    filePath: path.join(path.resolve(env.uploadDir), version.storagePath),
    fileName: version.fileName,
  };
}
