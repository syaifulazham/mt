-- AlterTable
ALTER TABLE "events" DROP COLUMN IF EXISTS "walkInSlotSchedule";

-- AlterTable
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "walkInSlotSchedule" JSONB;
