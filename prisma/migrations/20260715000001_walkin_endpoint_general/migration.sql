-- Add eventId (nullable first for backfill)
ALTER TABLE "walkin_endpoints" ADD COLUMN "eventId" TEXT;

-- Backfill eventId from the competition's event
UPDATE "walkin_endpoints" ep
SET "eventId" = wic."eventId"
FROM "event_walkin_competitions" wic
WHERE wic.id = ep."walkInCompetitionId";

-- For any rows that couldn't be backfilled (orphaned), delete them
DELETE FROM "walkin_endpoints" WHERE "eventId" IS NULL;

-- Make eventId NOT NULL
ALTER TABLE "walkin_endpoints" ALTER COLUMN "eventId" SET NOT NULL;

-- Make walkInCompetitionId nullable
ALTER TABLE "walkin_endpoints" ALTER COLUMN "walkInCompetitionId" DROP NOT NULL;

-- Drop old FK (CASCADE) and replace with SET NULL
ALTER TABLE "walkin_endpoints" DROP CONSTRAINT IF EXISTS "walkin_endpoints_walkInCompetitionId_fkey";
ALTER TABLE "walkin_endpoints" ADD CONSTRAINT "walkin_endpoints_walkInCompetitionId_fkey"
  FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add FK for eventId
ALTER TABLE "walkin_endpoints" ADD CONSTRAINT "walkin_endpoints_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
