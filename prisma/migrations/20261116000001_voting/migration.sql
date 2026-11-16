-- Public voting ("Undian Awam") sessions, entries and ballots.
CREATE TABLE "voting_sessions" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "minScore" INTEGER NOT NULL DEFAULT 1,
    "maxScore" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "showResults" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voting_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voting_entries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voting_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voting_ballots" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "ipHash" TEXT,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voting_ballots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voting_sessions_routeSlug_key" ON "voting_sessions"("routeSlug");
CREATE INDEX "voting_sessions_eventCompetitionId_idx" ON "voting_sessions"("eventCompetitionId");
CREATE INDEX "voting_entries_sessionId_idx" ON "voting_entries"("sessionId");
CREATE UNIQUE INDEX "voting_ballots_entryId_voterKey_key" ON "voting_ballots"("entryId", "voterKey");
CREATE INDEX "voting_ballots_sessionId_idx" ON "voting_ballots"("sessionId");

ALTER TABLE "voting_sessions" ADD CONSTRAINT "voting_sessions_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voting_entries" ADD CONSTRAINT "voting_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "voting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voting_ballots" ADD CONSTRAINT "voting_ballots_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "voting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
