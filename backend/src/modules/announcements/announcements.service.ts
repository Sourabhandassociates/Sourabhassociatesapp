import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import { recordAuditLog } from "../../utils/auditLog";
import { notify } from "../../utils/notify";
import { AccessTokenPayload } from "../../utils/jwt";

/**
 * Milestone 4 (Version 1.0 completion, SRD Section 24/6.15/18 — Office Announcements
 * Composer). Enhanced 2026-08-12 into a proper internal-communication system: every
 * posted announcement fans out an in-app Notification (utils/notify.ts) to its
 * resolved audience, tracked for read/unread via that same Notification row rather
 * than a second parallel table — Notification is already the generic "who was told
 * about this and did they see it" store used by every other trigger in the app
 * (Case/Hearing/Document/Invoice), so Announcement reuses it instead of inventing a
 * duplicate AnnouncementRecipient/AnnouncementRead model. Matches SRD Section 8's
 * "Post office announcements" row exactly: Managing Partner posts live immediately;
 * Office Staff's announcement is always created as a draft (isActive: false)
 * regardless of what the request asks for — the service enforces this, not just a
 * role-default permission check, the same way Milestone 2 enforces Associate-drafts-
 * only invoices at the service layer.
 */
export type AnnouncementPriority = "NORMAL" | "IMPORTANT" | "CRITICAL";
export type AnnouncementAudience =
  | "EVERYONE"
  | "MANAGING_PARTNER"
  | "ASSOCIATE"
  | "OFFICE_STAFF"
  | "ACCOUNTS_TEAM"
  | "SELECTED_USERS";

/** Announcements simplification (2026-08-13, direct Managing Partner instruction) —
 * `priority`/`audience`/`selectedUserIds`/`startDate`/`expiryDate` are no longer
 * accepted from the caller at all. Every announcement is now unconditionally
 * EVERYONE-audience/NORMAL-priority, enforced here in the service layer (not just by
 * the frontend composer no longer asking) — the schema columns and the
 * `AnnouncementPriority`/`AnnouncementAudience` types themselves are left untouched so
 * historical announcements (created before this pass, with real priority/audience/
 * date-window values) keep displaying and auditing correctly; only the create path
 * stops varying them. */
export interface CreateAnnouncementInput {
  title: string;
  body: string;
}

/** Dashboard auto-expiry pass (2026-08-12) — a hard ceiling, not a default: every
 * announcement stops appearing on the Dashboard 24 hours after it was posted
 * (`createdAt`), regardless of any explicit Expiry Date. An explicit Expiry Date can
 * still narrow the window (hide it sooner), it just can never extend visibility past
 * the 24-hour mark — confirmed directly with the Managing Partner rather than
 * assumed, since the alternative (24h as only a default) would have let a long
 * explicit Expiry Date silently outlive it. */
const DASHBOARD_AUTO_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** No background job scheduler exists anywhere in this app — the date window below
 * is a live, read-time filter (never a value physically flipped by a ticking
 * process), and notifications fire immediately at post time regardless of a future
 * `startDate`. A "deliver notifications later, at the scheduled start date" flow
 * would need real job-scheduling infrastructure this deployment doesn't have; a
 * half-working approximation of it would be worse than the documented limitation. */
export function isWithinDateWindow(now: Date, createdAt: Date, startDate: Date | null, expiryDate: Date | null): boolean {
  if (startDate && startDate > now) return false;
  const autoExpiry = new Date(createdAt.getTime() + DASHBOARD_AUTO_EXPIRY_MS);
  const effectiveExpiry = expiryDate && expiryDate < autoExpiry ? expiryDate : autoExpiry;
  return effectiveExpiry >= now;
}

/** Resolves an audience selection to concrete, currently-active user ids. ASSOCIATE
 * targets both ASSOCIATE and JUNIOR_ASSOCIATE (SRD Section 3's "Advocates" grouping).
 * The creator is always excluded — notifying yourself about your own post is noise,
 * and it keeps the read-tracking recipient count meaning "people this was sent to",
 * not "people this was sent to, plus the author". */
async function resolveRecipientUserIds(
  audience: AnnouncementAudience,
  selectedUserIds: string[] | undefined,
  excludeUserId: string
): Promise<string[]> {
  if (audience === "SELECTED_USERS") {
    return Array.from(new Set(selectedUserIds ?? [])).filter((id) => id !== excludeUserId);
  }
  const roleFilter: Prisma.UserWhereInput =
    audience === "EVERYONE" ? {} : audience === "ASSOCIATE" ? { role: { in: ["ASSOCIATE", "JUNIOR_ASSOCIATE"] } } : { role: audience };
  const users = await prisma.user.findMany({ where: { status: "ACTIVE", ...roleFilter }, select: { id: true } });
  return users.map((u) => u.id).filter((id) => id !== excludeUserId);
}

export async function createAnnouncement(actor: AccessTokenPayload, input: CreateAnnouncementInput) {
  const isActive = actor.role === "MANAGING_PARTNER";

  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      isActive,
      priority: "NORMAL",
      audience: "EVERYONE",
      startDate: null,
      expiryDate: null,
      selectedUserIds: [],
      createdById: actor.sub,
    },
  });
  await recordAuditLog(actor, "ANNOUNCEMENT_CREATED", "Announcement", announcement.id, { entityName: announcement.title });

  // A draft (Office-Staff-authored, pending Managing Partner approval) isn't real
  // yet — no one should be notified about it until it's actually published.
  if (isActive) {
    const recipientIds = await resolveRecipientUserIds("EVERYONE", [], actor.sub);
    await Promise.all(
      recipientIds.map((userId) =>
        notify(userId, "ANNOUNCEMENT_POSTED", `New Office Announcement: ${announcement.title}`, "Announcement", announcement.id)
      )
    );
  }

  return announcement;
}

/** Every staff role can see effectively-active announcements (dashboard widget) —
 * "effectively active" now also respects the start/expiry date window (including the
 * 24-hour-from-posting auto-expiry ceiling above), not just the manual `isActive`
 * flag. Only a Managing Partner request also sees drafts (their own moderation
 * queue) and announcements outside their own date window (so they can still
 * find/manage something that hasn't started yet or already expired). `isReadByMe`
 * is joined from the actor's own Notification row for each announcement so the
 * Dashboard widget can show a per-card read/unread state without a second request. */
export async function listAnnouncements(actor: AccessTokenPayload) {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: actor.role === "MANAGING_PARTNER" ? {} : { isActive: true },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const ids = announcements.map((a) => a.id);
  const myNotifications = await prisma.notification.findMany({
    where: { userId: actor.sub, entityType: "Announcement", entityId: { in: ids } },
    select: { entityId: true, isRead: true, readAt: true },
  });
  const myReadByAnnouncementId = new Map(myNotifications.map((n) => [n.entityId, n]));

  return announcements
    .filter((a) => actor.role === "MANAGING_PARTNER" || isWithinDateWindow(now, a.createdAt, a.startDate, a.expiryDate))
    .map((a) => ({
      ...a,
      isEffectivelyActive: a.isActive && isWithinDateWindow(now, a.createdAt, a.startDate, a.expiryDate),
      isReadByMe: myReadByAnnouncementId.get(a.id)?.isRead ?? null,
      readAtByMe: myReadByAnnouncementId.get(a.id)?.readAt ?? null,
    }));
}

/** Single-announcement fetch for the detail screen (notification click-through, or a
 * direct link from the Dashboard widget). Scoped like every other case-adjacent
 * screen in this app: the Managing Partner can open anything (oversight/moderation),
 * everyone else only what they were actually sent — i.e. they hold a Notification row
 * for it. Without this check, guessing another announcement's id would leak content
 * meant for a narrower audience (e.g. an Accounts-Team-only announcement). */
export async function getAnnouncementById(actor: AccessTokenPayload, id: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!announcement) throw new NotFoundError("Announcement not found");

  if (actor.role !== "MANAGING_PARTNER") {
    const myNotification = await prisma.notification.findFirst({
      where: { userId: actor.sub, entityType: "Announcement", entityId: id },
    });
    if (!myNotification) throw new NotFoundError("Announcement not found");
  }

  const myNotification = await prisma.notification.findFirst({
    where: { userId: actor.sub, entityType: "Announcement", entityId: id },
    select: { isRead: true, readAt: true },
  });

  return { ...announcement, isReadByMe: myNotification?.isRead ?? null, readAtByMe: myNotification?.readAt ?? null };
}

/** Marks the actor's own Notification for this announcement read (requirement: "a
 * notification should remain unread until the user opens the announcement or
 * explicitly marks it as read" — this single action covers both paths, since opening
 * the detail screen calls it automatically and the Dashboard widget's "Mark as Read"
 * button calls it directly). A no-op, not an error, if the actor was never a
 * recipient (e.g. the Managing Partner viewing an announcement they didn't author or
 * get sent, or a legacy announcement posted before this feature existed) — there is
 * nothing to mark. */
export async function markAnnouncementRead(actor: AccessTokenPayload, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { userId: actor.sub, entityType: "Announcement", entityId: id },
  });
  if (!notification || notification.isRead) return;
  await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true, readAt: new Date() } });
}

/** Managing-Partner-only — publishes an Office-Staff-authored draft, or unpublishes/
 * archives a live one. Publishing a previously-draft announcement fans out
 * notifications now, at the moment it actually becomes visible — a draft's
 * `createAnnouncement` call deliberately skipped that step. */
export async function setAnnouncementActive(actor: AccessTokenPayload, id: string, isActive: boolean) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Announcement not found");
  const updated = await prisma.announcement.update({ where: { id }, data: { isActive } });
  await recordAuditLog(actor, "ANNOUNCEMENT_STATUS_CHANGED", "Announcement", id, {
    entityName: existing.title,
    changes: { isActive: { old: existing.isActive, new: updated.isActive } },
  });

  if (isActive && !existing.isActive) {
    const recipientIds = await resolveRecipientUserIds(existing.audience, existing.selectedUserIds, existing.createdById);
    const priorityPrefix = existing.priority === "CRITICAL" ? "[Critical] " : existing.priority === "IMPORTANT" ? "[Important] " : "";
    await Promise.all(
      recipientIds.map((userId) =>
        notify(userId, "ANNOUNCEMENT_POSTED", `${priorityPrefix}New Office Announcement: ${existing.title}`, "Announcement", id)
      )
    );
  }

  return updated;
}

/** Managing-Partner-only read-tracking report (requirement: total recipients, read
 * count, unread count, who read it and when, who hasn't). Derived entirely from the
 * Notification rows created at post/publish time — those rows ARE the recipient
 * list, by construction, so there is nothing else to join against. */
export async function getAnnouncementReadTracking(actor: AccessTokenPayload, id: string) {
  if (actor.role !== "MANAGING_PARTNER") {
    throw new ForbiddenError("Only the Managing Partner can view announcement read tracking");
  }
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw new NotFoundError("Announcement not found");

  const notifications = await prisma.notification.findMany({
    where: { entityType: "Announcement", entityId: id },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { readAt: "desc" },
  });

  const readUsers = notifications
    .filter((n) => n.isRead)
    .map((n) => ({ id: n.user.id, name: n.user.name, role: n.user.role, readAt: n.readAt }));
  const unreadUsers = notifications.filter((n) => !n.isRead).map((n) => ({ id: n.user.id, name: n.user.name, role: n.user.role }));

  return {
    totalRecipients: notifications.length,
    readCount: readUsers.length,
    unreadCount: unreadUsers.length,
    readUsers,
    unreadUsers,
  };
}
