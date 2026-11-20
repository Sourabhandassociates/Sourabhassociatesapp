-- Add Bundle Number to existing cases without changing existing records.
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "bundleNumber" TEXT;
