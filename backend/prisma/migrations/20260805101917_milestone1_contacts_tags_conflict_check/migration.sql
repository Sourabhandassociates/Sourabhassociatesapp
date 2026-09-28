-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PicklistCategory" ADD VALUE 'CONTACT_CATEGORY';
ALTER TYPE "PicklistCategory" ADD VALUE 'TAG';

-- CreateTable
CREATE TABLE "CaseTag" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "organization" TEXT,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMatter" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "ContactMatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictCheckLog" (
    "id" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerEntityId" TEXT NOT NULL,
    "searchedName" TEXT NOT NULL,
    "matches" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictCheckLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseTag_caseId_idx" ON "CaseTag"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseTag_caseId_tag_key" ON "CaseTag"("caseId", "tag");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");

-- CreateIndex
CREATE INDEX "Contact_category_idx" ON "Contact"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ContactMatter_contactId_caseId_key" ON "ContactMatter"("contactId", "caseId");

-- CreateIndex
CREATE INDEX "ConflictCheckLog_triggerType_triggerEntityId_idx" ON "ConflictCheckLog"("triggerType", "triggerEntityId");

-- AddForeignKey
ALTER TABLE "CaseTag" ADD CONSTRAINT "CaseTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMatter" ADD CONSTRAINT "ContactMatter_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMatter" ADD CONSTRAINT "ContactMatter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCheckLog" ADD CONSTRAINT "ConflictCheckLog_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
