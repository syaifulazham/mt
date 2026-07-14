-- CreateEnum
CREATE TYPE "WalkInStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalkInMethod" AS ENUM ('COUNTER', 'PORTAL');

-- CreateTable: walk-in competition links (separate from main event_competitions)
CREATE TABLE "event_walkin_competitions" (
    "id"              TEXT NOT NULL,
    "eventId"         TEXT NOT NULL,
    "competitionId"   TEXT NOT NULL,
    "picName"         TEXT,
    "picContact"      TEXT,
    "maxSlots"        INTEGER NOT NULL DEFAULT 0,
    "publishToPortal" BOOLEAN NOT NULL DEFAULT false,
    "routeSlug"       TEXT,
    "passcode"        TEXT,
    "endpointActive"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_walkin_competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: individual walk-in registrations
CREATE TABLE "walkin_registrations" (
    "id"                  TEXT NOT NULL,
    "walkInCompetitionId" TEXT NOT NULL,
    "participantId"       TEXT NOT NULL,
    "contingentId"        TEXT NOT NULL,
    "status"              "WalkInStatus" NOT NULL DEFAULT 'PENDING',
    "method"              "WalkInMethod" NOT NULL DEFAULT 'PORTAL',
    "registeredBy"        TEXT,
    "confirmedAt"         TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walkin_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_walkin_competitions_routeSlug_key" ON "event_walkin_competitions"("routeSlug");
CREATE UNIQUE INDEX "event_walkin_competitions_eventId_competitionId_key" ON "event_walkin_competitions"("eventId", "competitionId");
CREATE UNIQUE INDEX "walkin_registrations_walkInCompetitionId_participantId_key" ON "walkin_registrations"("walkInCompetitionId", "participantId");

-- AddForeignKey
ALTER TABLE "event_walkin_competitions" ADD CONSTRAINT "event_walkin_competitions_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_walkin_competitions" ADD CONSTRAINT "event_walkin_competitions_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "walkin_registrations" ADD CONSTRAINT "walkin_registrations_walkInCompetitionId_fkey"
    FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "walkin_registrations" ADD CONSTRAINT "walkin_registrations_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "walkin_registrations" ADD CONSTRAINT "walkin_registrations_contingentId_fkey"
    FOREIGN KEY ("contingentId") REFERENCES "contingents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
