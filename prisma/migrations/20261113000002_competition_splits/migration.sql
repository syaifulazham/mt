-- Competition splits (hand-scoped): one competition judged as several labelled
-- event competitions. Existing rows keep splitLabel '' and stay unique.
ALTER TABLE "event_competitions" ADD COLUMN "splitLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "event_competitions" ADD COLUMN "parentId" TEXT;
ALTER TABLE "event_competitions" ADD COLUMN "countInMedals" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS "event_competitions_eventId_competitionId_key";
CREATE UNIQUE INDEX "event_competitions_eventId_competitionId_splitLabel_key" ON "event_competitions"("eventId", "competitionId", "splitLabel");
CREATE INDEX "event_competitions_parentId_idx" ON "event_competitions"("parentId");
ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
