import { prisma } from "../config/prisma";

/**
 * Milestone 3 (Version 1.0 completion, SRD Section 17 — Notifications & Reminders,
 * in-app channel). A single, tiny fire-and-forget helper any existing module can call
 * from its own service without restructuring — matching how `recordAuditLog` (Phase 2)
 * is reused the same way rather than every module reinventing its own logging.
 * Failures are swallowed (logged, not thrown) for the same reason `recordAuditLog`
 * does — a notification is a side effect of the real action, and its failure must
 * never roll back or block the action that triggered it.
 */
export async function notify(
  userId: string,
  type: string,
  message: string,
  entityType?: string,
  entityId?: string
): Promise<void> {
  try {
    await prisma.notification.create({ data: { userId, type, message, entityType, entityId } });
  } catch (err) {
    console.error("Failed to create notification", { userId, type, err });
  }
}

/** Convenience for the common "notify everyone with access to this case" case
 * (Partner + Advocates) — used by Hearing/Case-status/Case-reassignment triggers. */
export async function notifyCaseTeam(caseId: string, type: string, message: string, excludeUserId?: string): Promise<void> {
  const testCase = await prisma.case.findUnique({
    where: { id: caseId },
    select: { partnerId: true, advocates: { select: { userId: true } } },
  });
  if (!testCase) return;

  const userIds = new Set([testCase.partnerId, ...testCase.advocates.map((a) => a.userId)]);
  if (excludeUserId) userIds.delete(excludeUserId);

  await Promise.all(Array.from(userIds).map((userId) => notify(userId, type, message, "Case", caseId)));
}
