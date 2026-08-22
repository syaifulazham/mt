-- CreateEnum
CREATE TYPE "WalkInFormSubmissionStatus" AS ENUM ('PENDING', 'PROCESSED', 'NO_MATCH');

-- CreateTable
CREATE TABLE "walkin_form_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walkin_form_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walkin_form_submissions" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "walkInCompetitionId" TEXT NOT NULL,
    "ic" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolName" TEXT,
    "sessionNumber" INTEGER,
    "slotNumber" INTEGER,
    "status" "WalkInFormSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "participantId" TEXT,
    "walkInRegistrationId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walkin_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "walkin_form_endpoints_routeSlug_key" ON "walkin_form_endpoints"("routeSlug");

-- CreateIndex
CREATE INDEX "walkin_form_submissions_endpointId_status_idx" ON "walkin_form_submissions"("endpointId", "status");

-- CreateIndex
CREATE INDEX "walkin_form_submissions_ic_idx" ON "walkin_form_submissions"("ic");

-- AddForeignKey
ALTER TABLE "walkin_form_endpoints" ADD CONSTRAINT "walkin_form_endpoints_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_form_submissions" ADD CONSTRAINT "walkin_form_submissions_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "walkin_form_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_form_submissions" ADD CONSTRAINT "walkin_form_submissions_walkInCompetitionId_fkey" FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_form_submissions" ADD CONSTRAINT "walkin_form_submissions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_form_submissions" ADD CONSTRAINT "walkin_form_submissions_walkInRegistrationId_fkey" FOREIGN KEY ("walkInRegistrationId") REFERENCES "walkin_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
-- Partial unique index so a reserved slot can only be held by one submission (race-safe)
CREATE UNIQUE INDEX "walkin_form_submissions_slot_unique" ON "walkin_form_submissions"("walkInCompetitionId", "sessionNumber", "slotNumber") WHERE "sessionNumber" IS NOT NULL;
