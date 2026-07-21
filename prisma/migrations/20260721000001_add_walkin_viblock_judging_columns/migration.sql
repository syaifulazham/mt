-- Add new columns to event_walkin_competitions
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "useViblockarena" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "useDronearena" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "viblockChallengeId" TEXT;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "viblockChallengeLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "judgingTemplatesLocked" BOOLEAN NOT NULL DEFAULT false;

-- Add viblockToken to walkin_registrations
ALTER TABLE "walkin_registrations" ADD COLUMN IF NOT EXISTS "viblockToken" TEXT;

-- Create event_walkin_competition_judging_templates table
CREATE TABLE IF NOT EXISTS "event_walkin_competition_judging_templates" (
    "id" TEXT NOT NULL,
    "walkInCompetitionId" TEXT NOT NULL,
    "judgingTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_walkin_competition_judging_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "event_walkin_competition_judging_templates_walkInCompetitionId_judgingTemplateId_key"
    ON "event_walkin_competition_judging_templates"("walkInCompetitionId", "judgingTemplateId");

-- AddForeignKey
ALTER TABLE "event_walkin_competition_judging_templates" ADD CONSTRAINT "event_walkin_competition_judging_templates_walkInCompetitionId_fkey"
    FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_walkin_competition_judging_templates" ADD CONSTRAINT "event_walkin_competition_judging_templates_judgingTemplateId_fkey"
    FOREIGN KEY ("judgingTemplateId") REFERENCES "judging_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
