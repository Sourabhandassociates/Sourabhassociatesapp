-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "description" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
