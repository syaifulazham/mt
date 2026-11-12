-- Passcode links replicating a competition's duel manager (hand-scoped).
CREATE TABLE "duel_control_endpoints" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "access" TEXT NOT NULL DEFAULT 'CONTROL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "duel_control_endpoints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "duel_control_endpoints_routeSlug_key" ON "duel_control_endpoints"("routeSlug");
CREATE INDEX "duel_control_endpoints_eventCompetitionId_idx" ON "duel_control_endpoints"("eventCompetitionId");
ALTER TABLE "duel_control_endpoints" ADD CONSTRAINT "duel_control_endpoints_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
