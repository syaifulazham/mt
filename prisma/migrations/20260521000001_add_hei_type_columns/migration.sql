-- Add columns to higher_institutions that were added via db push but never migrated

ALTER TABLE "higher_institutions" ADD COLUMN IF NOT EXISTS "heiType"    TEXT NOT NULL DEFAULT 'HQ';
ALTER TABLE "higher_institutions" ADD COLUMN IF NOT EXISTS "parentCode" TEXT;
ALTER TABLE "higher_institutions" ADD COLUMN IF NOT EXISTS "sector"     TEXT;
