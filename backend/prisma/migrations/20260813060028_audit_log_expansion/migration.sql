-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "userRole" TEXT,
ADD COLUMN     "entityName" TEXT,
ADD COLUMN     "changes" JSONB,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
