-- Create enum if not exists (was added via db push, never migrated)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContingentManagerStatus') THEN
    CREATE TYPE "ContingentManagerStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
  END IF;
END $$;

-- Add missing columns to contingent_managers
ALTER TABLE "contingent_managers" ADD COLUMN IF NOT EXISTS "status"         "ContingentManagerStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "contingent_managers" ADD COLUMN IF NOT EXISTS "requestMessage" TEXT;
ALTER TABLE "contingent_managers" ADD COLUMN IF NOT EXISTS "respondedAt"    TIMESTAMP(3);
