-- Anugerah Tambahan: additional awards beside the ranked places (hand-scoped).
CREATE TABLE "special_awards" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'COMPETITION',
    "recipientType" TEXT NOT NULL DEFAULT 'TEAM',
    "eventCompetitionId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'CUSTOM',
    "templateIds" TEXT[],
    "places" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "special_awards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "special_awards_eventId_idx" ON "special_awards"("eventId");
ALTER TABLE "special_awards" ADD CONSTRAINT "special_awards_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "special_awards" ADD CONSTRAINT "special_awards_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "special_award_winners" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "teamId" TEXT,
    "participantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "special_award_winners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "special_award_winners_awardId_idx" ON "special_award_winners"("awardId");
ALTER TABLE "special_award_winners" ADD CONSTRAINT "special_award_winners_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "special_awards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "special_award_winners" ADD CONSTRAINT "special_award_winners_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "special_award_winners" ADD CONSTRAINT "special_award_winners_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
