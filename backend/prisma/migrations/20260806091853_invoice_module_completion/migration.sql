-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_caseId_fkey";

-- AlterTable
ALTER TABLE "FirmProfile" ADD COLUMN     "accountHolderName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "ifsc" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "swift" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "termsAndConditions" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
