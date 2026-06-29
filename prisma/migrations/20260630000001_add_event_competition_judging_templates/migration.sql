-- CreateTable
CREATE TABLE "event_competition_judging_templates" (
    "id" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "judgingTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_competition_judging_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_competition_judging_templates_eventCompetitionId_judgi_key" ON "event_competition_judging_templates"("eventCompetitionId", "judgingTemplateId");

-- AddForeignKey
ALTER TABLE "event_competition_judging_templates" ADD CONSTRAINT "event_competition_judging_templates_eventCompetitionId_fkey" FOREIGN KEY ("eventCompetitionId") REFERENCES "event_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_competition_judging_templates" ADD CONSTRAINT "event_competition_judging_templates_judgingTemplateId_fkey" FOREIGN KEY ("judgingTemplateId") REFERENCES "judging_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
