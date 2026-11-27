import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import { AccessTokenPayload } from "../../utils/jwt";

/** Self-scoped by design — every staff member sees only their own notifications, so
 * there's no row-level scoping function to reuse (unlike Cases/Clients/Documents) and
 * no new permission key either (analogous to "My Tasks"/TASKS.VIEW_OWN, which every
 * role holds by default). */
const ANNOUNCEMENT_RETENTION_HOURS = 24;
function announcementCutoff() {
  return new Date(Date.now() - ANNOUNCEMENT_RETENTION_HOURS * 60 * 60 * 1000);
}
const notificationRetentionFilter = () => ({
  OR: [
    { entityType: { not: "Announcement" } },
    { entityType: "Announcement", createdAt: { gte: announcementCutoff() } },
  ],
});

export async function listNotifications(actor: AccessTokenPayload, unreadOnly: boolean) {
  return prisma.notification.findMany({
    where: { userId: actor.sub, ...notificationRetentionFilter(), ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function unreadCount(actor: AccessTokenPayload) {
  return prisma.notification.count({ where: { userId: actor.sub, isRead: false, ...notificationRetentionFilter() } });
}

export async function markRead(actor: AccessTokenPayload, id: string) {
  const notification = await prisma.notification.findFirst({ where: { id, userId: actor.sub } });
  if (!notification) throw new NotFoundError("Notification not found");
  await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
}

export async function markAllRead(actor: AccessTokenPayload) {
  await prisma.notification.updateMany({ where: { userId: actor.sub, isRead: false }, data: { isRead: true, readAt: new Date() } });
}
