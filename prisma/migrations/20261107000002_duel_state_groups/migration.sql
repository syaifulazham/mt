-- Duel scope "Negeri": rounds belong to a state group ("" = national bracket).

-- AlterTable
ALTER TABLE "duel_rounds" ADD COLUMN "groupKey" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "duel_rounds_eventCompetitionId_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "duel_rounds_eventCompetitionId_groupKey_number_key" ON "duel_rounds"("eventCompetitionId", "groupKey", "number");
