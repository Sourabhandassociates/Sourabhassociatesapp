-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "arguments" TEXT,
ADD COLUMN     "argumentsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "argumentsUpdatedById" TEXT,
ADD COLUMN     "facts" TEXT,
ADD COLUMN     "factsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "factsUpdatedById" TEXT;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_factsUpdatedById_fkey" FOREIGN KEY ("factsUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_argumentsUpdatedById_fkey" FOREIGN KEY ("argumentsUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

