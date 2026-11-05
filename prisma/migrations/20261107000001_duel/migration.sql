-- Duel competitions: judging method on event competitions, drawn rounds/sessions/entries, public display links.

-- AlterTable
ALTER TABLE "event_competitions" ADD COLUMN "duelConfig" JSONB,
ADD COLUMN "judgingMethod" TEXT NOT NULL DEFAULT 'SCORE';

-- CreateTable
CREATE TABLE "duel_rounds" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "split" TEXT NOT NULL DEFAULT 'even',
    "noSameContingent" BOOLEAN NOT NULL DEFAULT false,
    "noSameState" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_sessions" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "arena" INTEGER NOT NULL DEFAULT 1,
    "wave" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedMs" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_entries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "points" INTEGER,
    "advanced" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "duel_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_display_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT,
    "label" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SCHEDULE',
    "competitionIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_display_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duel_rounds_eventCompetitionId_number_key" ON "duel_rounds"("eventCompetitionId", "number");
CREATE INDEX "duel_sessions_roundId_idx" ON "duel_sessions"("roundId");
CREATE INDEX "duel_entries_teamId_idx" ON "duel_entries"("teamId");
CREATE UNIQUE INDEX "duel_entries_sessionId_teamId_key" ON "duel_entries"("sessionId", "teamId");
CREATE UNIQUE INDEX "duel_display_endpoints_routeSlug_key" ON "duel_display_endpoints"("routeSlug");
CREATE INDEX "duel_display_endpoints_eventId_idx" ON "duel_display_endpoints"("eventId");

-- AddForeignKey
ALTER TABLE "duel_rounds" ADD CONSTRAINT "duel_rounds_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duel_sessions" ADD CONSTRAINT "duel_sessions_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "duel_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duel_entries" ADD CONSTRAINT "duel_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "duel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duel_entries" ADD CONSTRAINT "duel_entries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duel_display_endpoints" ADD CONSTRAINT "duel_display_endpoints_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
