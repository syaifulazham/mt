-- CreateEnum
CREATE TYPE "WalkInJudgingEndpointStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "walkin_judging_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "walkInCompetitionId" TEXT NOT NULL,
    "judgingTemplateId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "status" "WalkInJudgingEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walkin_judging_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "walkin_judging_endpoints_routeSlug_key" ON "walkin_judging_endpoints"("routeSlug");

-- CreateIndex
CREATE INDEX "walkin_judging_endpoints_walkInCompetitionId_idx" ON "walkin_judging_endpoints"("walkInCompetitionId");

-- AddForeignKey
ALTER TABLE "walkin_judging_endpoints" ADD CONSTRAINT "walkin_judging_endpoints_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_judging_endpoints" ADD CONSTRAINT "walkin_judging_endpoints_walkInCompetitionId_fkey"
  FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_judging_endpoints" ADD CONSTRAINT "walkin_judging_endpoints_judgingTemplateId_fkey"
  FOREIGN KEY ("judgingTemplateId") REFERENCES "judging_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
