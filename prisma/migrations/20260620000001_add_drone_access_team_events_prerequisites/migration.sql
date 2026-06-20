-- CreateTable: DroneAccess (per-participant, unique on participantId)
CREATE TABLE "drone_access" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "droneUserId" TEXT NOT NULL,
    "dronePassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drone_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamEvent (team ↔ event join table)
CREATE TABLE "team_events" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Competition — add thirdPartyIntegration (was added via db push, never migrated)
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "thirdPartyIntegration" TEXT NOT NULL DEFAULT 'none';

-- AlterTable: Event — add prerequisiteEventId self-relation
ALTER TABLE "events" ADD COLUMN "prerequisiteEventId" TEXT;

-- CreateIndex: DroneAccess unique participantId
CREATE UNIQUE INDEX "drone_access_participantId_key" ON "drone_access"("participantId");

-- CreateIndex: TeamEvent unique [teamId, eventId]
CREATE UNIQUE INDEX "team_events_teamId_eventId_key" ON "team_events"("teamId", "eventId");

-- AddForeignKey: DroneAccess → contestants (Participant maps to "contestants")
ALTER TABLE "drone_access" ADD CONSTRAINT "drone_access_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamEvent → teams
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamEvent → events
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Event → Event (prerequisite self-relation)
ALTER TABLE "events" ADD CONSTRAINT "events_prerequisiteEventId_fkey"
    FOREIGN KEY ("prerequisiteEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
