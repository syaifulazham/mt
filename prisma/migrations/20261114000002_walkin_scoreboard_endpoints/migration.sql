-- Public live scoreboards of VibeBlocks walk-in competitions (/live/<routeSlug>).
CREATE TABLE "walkin_scoreboard_endpoints" (
    "id" TEXT NOT NULL,
    "walkInCompetitionId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walkin_scoreboard_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "walkin_scoreboard_endpoints_routeSlug_key" ON "walkin_scoreboard_endpoints"("routeSlug");
CREATE INDEX "walkin_scoreboard_endpoints_walkInCompetitionId_idx" ON "walkin_scoreboard_endpoints"("walkInCompetitionId");

ALTER TABLE "walkin_scoreboard_endpoints" ADD CONSTRAINT "walkin_scoreboard_endpoints_walkInCompetitionId_fkey"
    FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
