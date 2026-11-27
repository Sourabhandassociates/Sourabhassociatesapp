ALTER TABLE "Hearing" ADD COLUMN "assignedAssociateId" TEXT;
CREATE INDEX "Hearing_assignedAssociateId_idx" ON "Hearing"("assignedAssociateId");
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_assignedAssociateId_fkey" FOREIGN KEY ("assignedAssociateId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
