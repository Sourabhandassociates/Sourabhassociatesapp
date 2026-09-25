-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "courtNumber" TEXT,
ALTER COLUMN "title" DROP NOT NULL,
ALTER COLUMN "practiceArea" DROP NOT NULL;

