-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('EVERYONE', 'MANAGING_PARTNER', 'ASSOCIATE', 'OFFICE_STAFF', 'ACCOUNTS_TEAM', 'SELECTED_USERS');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "audience" "AnnouncementAudience" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

