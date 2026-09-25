import path from "path";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AccessTokenPayload } from "../../utils/jwt";
import { NotFoundError } from "../../utils/errors";
import { loadActiveClientActor, requirePortalFlag, assertClientOwnsCase } from "../../utils/clientPortalAuthorization";

/**
 * Client Portal Permissions (2026-08-14). Every function here is read-only and
 * scoped entirely by the authenticated client's own id (`actor.sub`) — no function
 * in this file ever accepts or trusts a client id from the request. This is the
 * client-facing counterpart to the Managing-Partner-facing write path in
 * `clients.service.ts`'s `updatePortalPermissions`.
 */

export async function getMyProfile(actor: AccessTokenPayload) {
  const client = await loadActiveClientActor(actor);
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
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

export async function listMyCases(actor: AccessTokenPayload) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalCasesEnabled", "List of Cases");

  const links = await prisma.caseClient.findMany({
    where: { clientId: client.id, case: { deletedAt: null } },
    include: {
      case: {
        select: {
          id: true,
          matterNumber: true,
          title: true,
          status: true,
          stage: true,
          filingDate: true,
          courtName: true,
        },
      },
    },
    orderBy: { case: { createdAt: "desc" } },
  });
  return links.map((link) => ({ partyRole: link.partyRole, case: link.case }));
}

export async function getMyCase(actor: AccessTokenPayload, caseId: string) {
  const client = await loadActiveClientActor(actor);
  requirePortalFlag(client, "portalCasesEnabled", "List of Cases");
  await assertClientOwnsCase(actor, caseId);

  return prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      id: true,
      matterNumber: true,
      title: true,
      status: true,
      stage: true,
      caseType: true,
      filingDate: true,
      courtName: true,
      courtNumber: true,
      jurisdiction: true,
      department: true,
    },
  });
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
      case: { select: { matterNumber: true, title: true } },
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
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { versionNumber: true, fileName: true } },
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
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { storagePath: true, fileName: true } },
    },
  });
  const version = document?.versions[0];
  if (!version) throw new NotFoundError("Document not found");

  return {
    filePath: path.join(path.resolve(env.uploadDir), version.storagePath),
    fileName: version.fileName,
  };
}
