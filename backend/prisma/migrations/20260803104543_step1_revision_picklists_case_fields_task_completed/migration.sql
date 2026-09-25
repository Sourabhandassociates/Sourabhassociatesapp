-- CreateEnum
CREATE TYPE "PicklistCategory" AS ENUM ('COURT', 'JUDGE', 'CASE_STAGE', 'PRACTICE_AREA', 'CASE_TYPE', 'OPPOSITE_COUNSEL', 'OPPOSITE_PARTY', 'DEPARTMENT', 'HEARING_PURPOSE');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "caseType" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "oppositeCounsel" TEXT,
ADD COLUMN     "oppositeParty" TEXT,
ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PicklistValue" (
    "id" TEXT NOT NULL,
    "category" "PicklistCategory" NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PicklistValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PicklistValue_category_idx" ON "PicklistValue"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PicklistValue_category_value_key" ON "PicklistValue"("category", "value");
