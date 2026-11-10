-- CreateTable
CREATE TABLE "webcraft_ai_judgements" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "templateId" TEXT,
    "projectId" TEXT,
    "projectName" TEXT,
    "projectUrl" TEXT,
    "scores" JSONB,
    "total" DOUBLE PRECISION,
    "maxTotal" DOUBLE PRECISION,
    "comment" TEXT,
    "error" TEXT,
    "model" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "judgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webcraft_ai_judgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webcraft_ai_judgements_eventCompetitionId_status_idx" ON "webcraft_ai_judgements"("eventCompetitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webcraft_ai_judgements_eventCompetitionId_teamId_key" ON "webcraft_ai_judgements"("eventCompetitionId", "teamId");

-- AddForeignKey
ALTER TABLE "webcraft_ai_judgements" ADD CONSTRAINT "webcraft_ai_judgements_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webcraft_ai_judgements" ADD CONSTRAINT "webcraft_ai_judgements_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
