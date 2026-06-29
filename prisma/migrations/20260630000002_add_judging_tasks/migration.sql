-- CreateEnum
CREATE TYPE "JudgingTaskStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "judging_tasks" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "judgingTemplateId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "status" "JudgingTaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judging_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "judging_tasks_routeSlug_key" ON "judging_tasks"("routeSlug");

-- CreateIndex
CREATE INDEX "judging_tasks_eventCompetitionId_idx" ON "judging_tasks"("eventCompetitionId");

-- AddForeignKey
ALTER TABLE "judging_tasks" ADD CONSTRAINT "judging_tasks_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_tasks" ADD CONSTRAINT "judging_tasks_judgingTemplateId_fkey" FOREIGN KEY ("judgingTemplateId") REFERENCES "judging_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
