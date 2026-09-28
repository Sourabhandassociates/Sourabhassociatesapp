-- AlterEnum
ALTER TYPE "PicklistCategory" ADD VALUE 'CLIENT_TYPE';

-- AlterTable
-- Step 4: Client.type moves from the ClientType enum to a free-text column
-- validated by the Picklist system (CLIENT_TYPE category). Cast preserves
-- every existing stored value verbatim (INDIVIDUAL/COMPANY/GOVERNMENT/TRUST)
-- rather than dropping and recreating the column, so no client data is lost.
ALTER TABLE "Client" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- AlterTable
ALTER TABLE "Hearing" ADD COLUMN     "courtHall" TEXT;

-- DropEnum
DROP TYPE "ClientType";
