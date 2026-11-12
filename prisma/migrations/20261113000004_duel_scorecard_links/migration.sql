-- Per-session duel scorecard links (hand-scoped).
CREATE TABLE "duel_scorecard_links" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "duel_scorecard_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "duel_scorecard_links_sessionId_key" ON "duel_scorecard_links"("sessionId");
CREATE UNIQUE INDEX "duel_scorecard_links_routeSlug_key" ON "duel_scorecard_links"("routeSlug");
CREATE INDEX "duel_scorecard_links_eventCompetitionId_idx" ON "duel_scorecard_links"("eventCompetitionId");
ALTER TABLE "duel_scorecard_links" ADD CONSTRAINT "duel_scorecard_links_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "duel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
