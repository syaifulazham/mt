-- ── zone_states ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "zone_states" (
    "zoneId"  TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    CONSTRAINT "zone_states_pkey" PRIMARY KEY ("zoneId", "stateId")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'zone_states_zoneId_fkey') THEN
    ALTER TABLE "zone_states" ADD CONSTRAINT "zone_states_zoneId_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'zone_states_stateId_fkey') THEN
    ALTER TABLE "zone_states" ADD CONSTRAINT "zone_states_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── event_competitions ────────────────────────────────────────────────────────
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

CREATE UNIQUE INDEX IF NOT EXISTS "event_competitions_eventId_competitionId_key"
    ON "event_competitions"("eventId", "competitionId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'event_competitions_eventId_fkey') THEN
    ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'event_competitions_competitionId_fkey') THEN
    ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── teams (create if missing, then add new columns) ───────────────────────────
CREATE TABLE IF NOT EXISTS "teams" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "email"            TEXT,
    "lmsUserId"        TEXT,
    "lmsPassword"      TEXT,
    "lmsCourseEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "competitionId"    TEXT NOT NULL,
    "contingentId"     TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'teams_competitionId_fkey') THEN
    ALTER TABLE "teams" ADD CONSTRAINT "teams_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'teams_contingentId_fkey') THEN
    ALTER TABLE "teams" ADD CONSTRAINT "teams_contingentId_fkey"
      FOREIGN KEY ("contingentId") REFERENCES "contingents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Add new columns to teams if table already existed without them
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "email"             TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "lmsUserId"         TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "lmsPassword"       TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "lmsCourseEnrolled" BOOLEAN NOT NULL DEFAULT false;

-- ── competitions: add EptimEdu columns ───────────────────────────────────────
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "eptimEduCourseId"    TEXT;
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "eptimEduCourseTitle" TEXT;

-- ── contingents: add stateId ──────────────────────────────────────────────────
ALTER TABLE "contingents" ADD COLUMN IF NOT EXISTS "stateId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'contingents_stateId_fkey') THEN
    ALTER TABLE "contingents" ADD CONSTRAINT "contingents_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
