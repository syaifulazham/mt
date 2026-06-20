-- CreateTable: DroneAccess (per-participant, unique on participantId)
CREATE TABLE IF NOT EXISTS "drone_access" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "droneUserId" TEXT NOT NULL,
    "dronePassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drone_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamEvent (team ↔ event join table)
CREATE TABLE IF NOT EXISTS "team_events" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Competition — add thirdPartyIntegration (was added via db push, never migrated)
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "thirdPartyIntegration" TEXT NOT NULL DEFAULT 'none';

-- AlterTable: Event — add prerequisiteEventId self-relation
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "prerequisiteEventId" TEXT;

-- CreateIndex: DroneAccess unique participantId
CREATE UNIQUE INDEX IF NOT EXISTS "drone_access_participantId_key" ON "drone_access"("participantId");

-- CreateIndex: TeamEvent unique [teamId, eventId]
CREATE UNIQUE INDEX IF NOT EXISTS "team_events_teamId_eventId_key" ON "team_events"("teamId", "eventId");

-- AddForeignKey: DroneAccess → contestants (Participant maps to "contestants")
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drone_access_participantId_fkey'
  ) THEN
    ALTER TABLE "drone_access" ADD CONSTRAINT "drone_access_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: TeamEvent → teams
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_events_teamId_fkey'
  ) THEN
    ALTER TABLE "team_events" ADD CONSTRAINT "team_events_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: TeamEvent → events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_events_eventId_fkey'
  ) THEN
    ALTER TABLE "team_events" ADD CONSTRAINT "team_events_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: Event → Event (prerequisite self-relation)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_prerequisiteEventId_fkey'
  ) THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_prerequisiteEventId_fkey"
      FOREIGN KEY ("prerequisiteEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
