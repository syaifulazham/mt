-- Add missing columns to contingents (added via db push, never migrated)
ALTER TABLE "contingents" ADD COLUMN IF NOT EXISTS "shortName" TEXT;
ALTER TABLE "contingents" ADD COLUMN IF NOT EXISTS "logoUrl"   TEXT;
