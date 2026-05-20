-- CreateTable: zone_states (ZoneState join table)
CREATE TABLE IF NOT EXISTS "zone_states" (
    "zoneId"  TEXT NOT NULL,
    "stateId" TEXT NOT NULL,

    CONSTRAINT "zone_states_pkey" PRIMARY KEY ("zoneId", "stateId")
);

-- CreateTable: event_competitions (EventCompetition)
CREATE TABLE IF NOT EXISTS "event_competitions" (
    "id"            TEXT NOT NULL,
    "eventId"       TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "picName"       TEXT,
    "picContact"    TEXT,
    "maxTeams"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_competitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for event_competitions unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "event_competitions_eventId_competitionId_key"
    ON "event_competitions"("eventId", "competitionId");

-- AddForeignKey for zone_states
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'zone_states_zoneId_fkey'
  ) THEN
    ALTER TABLE "zone_states" ADD CONSTRAINT "zone_states_zoneId_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'zone_states_stateId_fkey'
  ) THEN
    ALTER TABLE "zone_states" ADD CONSTRAINT "zone_states_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey for event_competitions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'event_competitions_eventId_fkey'
  ) THEN
    ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'event_competitions_competitionId_fkey'
  ) THEN
    ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable competitions: add EptimEdu columns
ALTER TABLE "competitions"
  ADD COLUMN IF NOT EXISTS "eptimEduCourseId"    TEXT,
  ADD COLUMN IF NOT EXISTS "eptimEduCourseTitle" TEXT;

-- AlterTable teams: add email and LMS columns
ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "email"             TEXT,
  ADD COLUMN IF NOT EXISTS "lmsUserId"         TEXT,
  ADD COLUMN IF NOT EXISTS "lmsPassword"       TEXT,
  ADD COLUMN IF NOT EXISTS "lmsCourseEnrolled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable contingents: add stateId
ALTER TABLE "contingents"
  ADD COLUMN IF NOT EXISTS "stateId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contingents_stateId_fkey'
  ) THEN
    ALTER TABLE "contingents" ADD CONSTRAINT "contingents_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
