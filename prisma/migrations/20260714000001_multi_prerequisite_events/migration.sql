-- CreateTable: join table for multiple prerequisite events
CREATE TABLE "event_prerequisites" (
    "eventId"        TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "event_prerequisites_pkey" PRIMARY KEY ("eventId","prerequisiteId")
);

-- Migrate existing single-FK data into the join table
INSERT INTO "event_prerequisites" ("eventId", "prerequisiteId")
SELECT "id", "prerequisiteEventId"
FROM "events"
WHERE "prerequisiteEventId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "event_prerequisites" ADD CONSTRAINT "event_prerequisites_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_prerequisites" ADD CONSTRAINT "event_prerequisites_prerequisiteId_fkey"
    FOREIGN KEY ("prerequisiteId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumn (old single FK — data already migrated above)
ALTER TABLE "events" DROP COLUMN IF EXISTS "prerequisiteEventId";
