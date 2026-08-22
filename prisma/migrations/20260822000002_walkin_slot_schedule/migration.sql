-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "walkInSlotSchedule" JSONB;
