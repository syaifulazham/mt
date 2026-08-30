-- CreateEnum
CREATE TYPE "ParticipationPolicy" AS ENUM ('ALL', 'PREREQUISITE_SELECTED', 'ALL_EXCEPT_ZONE_WINNERS');

-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "participationPolicy" "ParticipationPolicy" NOT NULL DEFAULT 'ALL';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "winnerExclusionRank" INTEGER;

-- Default PREREQUISITE_SELECTED for events that already have prerequisites
UPDATE "events" SET "participationPolicy" = 'PREREQUISITE_SELECTED'
WHERE id IN (SELECT DISTINCT "eventId" FROM "event_prerequisites");
