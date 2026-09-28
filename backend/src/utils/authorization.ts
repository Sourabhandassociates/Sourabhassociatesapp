import { prisma } from "../config/prisma";
import { NotFoundError } from "./errors";
import { AccessTokenPayload, AuthorizedActor } from "./jwt";
import { logSecurityEvent } from "./securityLogger";
import { resolveViewScope } from "../modules/permissions/viewScope";

/**
 * Row-level access rules, shared across every module that touches a Case, Document,
 * Task, or Client, so the scoping logic exists in exactly one place (previously
 * `cases.controller.ts` had its own private `scopeForActor`, and Documents/Tasks/Clients
 * had none at all — see ARCHITECTURE_REVIEW.md §4).
 *
 * A missing-or-out-of-scope resource always throws NotFoundError (404), never
 * ForbiddenError (403) — that way a request for a real case/document/task/client the
 * actor isn't authorized to see is indistinguishable from one that doesn't exist at
 * all, which avoids confirming a resource's existence to someone who shouldn't know it.
 *
 * Step 3 M2: which filter tier applies (unscoped vs. assigned-only) is now decided by
 * `resolveViewScope` (STEP3_ROLE_PERMISSION_DESIGN.md Section 4) reading the actor's
 * effective permissions, replacing the hardcoded role-array checks these functions
 * used to run. The actual Prisma `where` shape for each tier — the whole point of
 * "row-level authorization is complemented, not replaced, by the permission system" —
 * is completely unchanged below: same OR-filter on `partnerId`/`advocates`, same
 * case-linked filter for clients, just now selected by permission tier instead of by
 * a hardcoded role list.
 */

/** A Prisma where-fragment guaranteed to match zero rows — the fail-closed fallback
 * for a view scope of NONE, which the seeded catalogue never actually produces for
 * any staff role today (every role holds at least one of VIEW_ALL/VIEW_ASSIGNED for
 * both Cases and Clients), but the code must still behave safely if it ever did. */
const MATCH_NOTHING = { id: "" };

/** SRD Section 3.2/3.3 — Associates/Junior Associates: only cases they own (as Partner) or are an assigned advocate on. */
export function caseScopeWhere(actor: AuthorizedActor) {
  const scope = resolveViewScope(actor, "CASES");
  if (scope === "ALL") return {};
  if (scope === "ASSIGNED") return { OR: [{ partnerId: actor.sub }, { advocates: { some: { userId: actor.sub } } }] };
  return MATCH_NOTHING;
}

/**
 * Step 2 — Soft Delete & Recycle Bin (SRD Section 27): a soft-deleted case is 404 for
 * every normal access path, the same as an out-of-scope one — only the Managing
 * Partner's Recycle Bin (a separate, deliberately unscoped query path) can see it.
 */
export async function assertCaseAccess(actor: AccessTokenPayload, caseId: string) {
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, deletedAt: null, ...caseScopeWhere(actor) },
  });
  if (!caseRecord) {
    await logOutOfScopeAttempt("Case", caseId, actor);
    throw new NotFoundError("Case not found");
  }
  return caseRecord;
}

/**
 * The client always gets an identical 404 either way (never confirm existence to an
 * unauthorized actor) — but server-side, "exists and you're just not authorized" is a
 * meaningfully different signal than "genuinely doesn't exist" (the former is worth
 * watching for repeated probing; the latter is often just a stale UI link/typo).
 */
async function logOutOfScopeAttempt(resourceType: "Case" | "Client", id: string, actor: AccessTokenPayload) {
  // deletedAt: null — a soft-deleted record isn't a "permission" story (Step 2), it's
  // just gone from every normal view; don't conflate that with an authorization probe.
  const exists =
    resourceType === "Case"
      ? await prisma.case.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
      : await prisma.client.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (exists) {
    logSecurityEvent("PERMISSION_DENIED", {
      message: `${resourceType} exists but actor has no row-level access to it`,
      actorId: actor.sub,
      actorRole: actor.role,
      resourceType,
      resourceId: id,
    });
  }
}

/**
 * ACCOUNTS module — General/Firm Expense receipt support (2026-08-15 follow-up). A
 * General/Firm expense has no case and no client to scope a receipt Document to —
 * every other document-creation path in the app always supplies one or the other
 * (Document.caseId/clientId nullability was introduced for case-less and client-
 * level Accounts receipts respectively; a General expense's receipt is the first
 * legitimate case of BOTH being null). Gated by ACCOUNTS.VIEW_EXPENSES alone — the
 * same permission that already gates the expense list this receipt belongs to —
 * rather than any row-level scope, matching how every other firm-wide Accounts view
 * (dashboard, expense list, reports) is already gated purely by permission
 * possession, never by row ownership. Deliberately does NOT check `expense.deletedAt`
 * — a receipt Document's own accessibility is independent of its parent Expense's
 * lifecycle, the same "left intact, its own lifecycle" precedent already established
 * for a deleted Payment's receipt (accounts.service.ts's deletePayment).
 */
async function assertScopelessAccountsDocumentAccess(actor: AuthorizedActor, documentId: string) {
  const isAccountsExpenseReceipt = await prisma.expense.findFirst({
    where: { receiptDocumentId: documentId },
    select: { id: true },
  });
  if (isAccountsExpenseReceipt && actor.effectivePermissions?.has("ACCOUNTS.VIEW_EXPENSES")) return;
  throw new NotFoundError("Document not found");
}

/**
 * A document exists either within a case's scope, directly within a client's scope
 * (ACCOUNTS module, 2026-08-14 — `Document.caseId` became nullable to support a
 * client-level receipt with no case at all, see `Document.clientId`), or — General/
 * Firm expense receipts only — within no row-level scope at all, gated purely by
 * Accounts-permission possession (see `assertScopelessAccountsDocumentAccess` above).
 */
export async function assertDocumentAccess(actor: AuthorizedActor, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, caseId: true, clientId: true, title: true },
  });
  if (!document) throw new NotFoundError("Document not found");
  if (document.caseId) {
    await assertCaseAccess(actor, document.caseId);
  } else if (document.clientId) {
    await assertClientAccess(actor, document.clientId);
  } else {
    await assertScopelessAccountsDocumentAccess(actor, document.id);
  }
  return document;
}

export async function assertDocumentVersionAccess(actor: AccessTokenPayload, versionId: string) {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, documentId: true },
  });
  if (!version) throw new NotFoundError("Version not found");
  await assertDocumentAccess(actor, version.documentId);
  return version;
}

/**
 * A task is visible to whoever has access to its case, PLUS always to its own
 * assignee (SRD 6.6 "My Tasks" — a Junior Associate must be able to act on a task
 * assigned to them even if they're not otherwise a listed advocate on the case).
 */
export async function assertTaskAccess(actor: AccessTokenPayload, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: {
      id: true,
      caseId: true,
      assignedToId: true,
      status: true,
      title: true,
      description: true,
      priority: true,
      dueDate: true,
    },
  });
  if (!task) throw new NotFoundError("Task not found");
  if (task.assignedToId === actor.sub) return task;
  await assertCaseAccess(actor, task.caseId);
  return task;
}

/** A hearing only exists within a case's scope, so hearing access is case access (SRD Section 15). */
export async function assertHearingAccess(actor: AccessTokenPayload, hearingId: string) {
  const hearing = await prisma.hearing.findUnique({
    where: { id: hearingId },
    select: { id: true, caseId: true, status: true, courtName: true, judgeName: true },
  });
  if (!hearing) throw new NotFoundError("Hearing not found");
  await assertCaseAccess(actor, hearing.caseId);
  return hearing;
}

/** SRD Section 3.2 — Associates/Junior Associates: only clients linked to a case they have access to. */
export function clientScopeWhere(actor: AuthorizedActor) {
  const scope = resolveViewScope(actor, "CLIENTS");
  if (scope === "ALL") return {};
  if (scope === "ASSIGNED") {
    return {
      cases: {
        some: { case: { OR: [{ partnerId: actor.sub }, { advocates: { some: { userId: actor.sub } } }] } },
      },
    };
  }
  return MATCH_NOTHING;
}

export async function assertClientAccess(actor: AccessTokenPayload, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null, ...clientScopeWhere(actor) },
  });
  if (!client) {
    await logOutOfScopeAttempt("Client", clientId, actor);
    throw new NotFoundError("Client not found");
  }
  return client;
}
