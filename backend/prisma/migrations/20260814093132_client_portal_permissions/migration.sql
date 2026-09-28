-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "portalCasesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalDocumentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalHearingHistoryEnabled" BOOLEAN NOT NULL DEFAULT true;
