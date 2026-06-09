-- Add lmsUserId and lmsPassword to manager_profiles
ALTER TABLE "manager_profiles" ADD COLUMN IF NOT EXISTS "lmsUserId"  TEXT;
ALTER TABLE "manager_profiles" ADD COLUMN IF NOT EXISTS "lmsPassword" TEXT;
