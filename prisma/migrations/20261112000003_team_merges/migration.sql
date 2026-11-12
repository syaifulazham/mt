-- Merged state teams (hand-scoped): several registered teams of one state
-- compete as one ("JOHOR A") in a national competition of any judging method.
ALTER TABLE "event_competitions" ADD COLUMN "mergeByState" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_competitions" ADD COLUMN "mergeMax" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "team_merges" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "teamIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_merges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_merges_eventCompetitionId_idx" ON "team_merges"("eventCompetitionId");
ALTER TABLE "team_merges" ADD CONSTRAINT "team_merges_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
