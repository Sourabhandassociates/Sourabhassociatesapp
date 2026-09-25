-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "selectedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
