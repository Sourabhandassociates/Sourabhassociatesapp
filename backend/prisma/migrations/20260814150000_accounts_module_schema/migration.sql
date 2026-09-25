-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "clientId" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentMode" "PaymentMode",
ADD COLUMN     "receiptDocumentId" TEXT,
ADD COLUMN     "vendor" TEXT;

-- CreateTable
CREATE TABLE "ProfessionalFee" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "agreementDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "ProfessionalFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsPayment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "feeId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "PaymentMode" NOT NULL,
    "referenceNumber" TEXT,
    "remarks" TEXT,
    "receiptDocumentId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "AccountsPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalFee_clientId_idx" ON "ProfessionalFee"("clientId");

-- CreateIndex
CREATE INDEX "ProfessionalFee_caseId_idx" ON "ProfessionalFee"("caseId");

-- CreateIndex
CREATE INDEX "ProfessionalFee_dueDate_idx" ON "ProfessionalFee"("dueDate");

-- CreateIndex
CREATE INDEX "ProfessionalFee_deletedAt_idx" ON "ProfessionalFee"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsPayment_receiptDocumentId_key" ON "AccountsPayment"("receiptDocumentId");

-- CreateIndex
CREATE INDEX "AccountsPayment_clientId_idx" ON "AccountsPayment"("clientId");

-- CreateIndex
CREATE INDEX "AccountsPayment_caseId_idx" ON "AccountsPayment"("caseId");

-- CreateIndex
CREATE INDEX "AccountsPayment_feeId_idx" ON "AccountsPayment"("feeId");

-- CreateIndex
CREATE INDEX "AccountsPayment_paymentDate_idx" ON "AccountsPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "AccountsPayment_deletedAt_idx" ON "AccountsPayment"("deletedAt");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_receiptDocumentId_key" ON "Expense"("receiptDocumentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalFee" ADD CONSTRAINT "ProfessionalFee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalFee" ADD CONSTRAINT "ProfessionalFee_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalFee" ADD CONSTRAINT "ProfessionalFee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalFee" ADD CONSTRAINT "ProfessionalFee_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "ProfessionalFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayment" ADD CONSTRAINT "AccountsPayment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
