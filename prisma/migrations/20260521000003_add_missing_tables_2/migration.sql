-- ── CriterionType enum ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CriterionType" AS ENUM ('NUMBER', 'TIME', 'SINGLE_OPTION', 'MULTIPLE_OPTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── team_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "team_members" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "contestantId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_members_teamId_contestantId_key"
    ON "team_members"("teamId", "contestantId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_members_teamId_fkey') THEN
    ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_members_contestantId_fkey') THEN
    ALTER TABLE "team_members" ADD CONSTRAINT "team_members_contestantId_fkey"
      FOREIGN KEY ("contestantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── trainers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "trainers" (
    "id"           TEXT        NOT NULL,
    "name"         TEXT        NOT NULL,
    "ic"           TEXT,
    "email"        TEXT,
    "phoneNumber"  TEXT,
    "contingentId" TEXT        NOT NULL,
    "status"       TEXT        NOT NULL DEFAULT 'ACTIVE',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trainers_contingentId_idx" ON "trainers"("contingentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'trainers_contingentId_fkey') THEN
    ALTER TABLE "trainers" ADD CONSTRAINT "trainers_contingentId_fkey"
      FOREIGN KEY ("contingentId") REFERENCES "contingents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── team_trainers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "team_trainers" (
    "id"        TEXT        NOT NULL,
    "teamId"    TEXT        NOT NULL,
    "trainerId" TEXT        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_trainers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_trainers_teamId_trainerId_key"
    ON "team_trainers"("teamId", "trainerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_trainers_teamId_fkey') THEN
    ALTER TABLE "team_trainers" ADD CONSTRAINT "team_trainers_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_trainers_trainerId_fkey') THEN
    ALTER TABLE "team_trainers" ADD CONSTRAINT "team_trainers_trainerId_fkey"
      FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── judging_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "judging_templates" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "code"        TEXT        NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "judging_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "judging_templates_code_key" ON "judging_templates"("code");

-- ── judging_criterions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "judging_criterions" (
    "id"         TEXT            NOT NULL,
    "templateId" TEXT            NOT NULL,
    "name"       TEXT            NOT NULL,
    "order"      INTEGER         NOT NULL DEFAULT 0,
    "type"       "CriterionType" NOT NULL,
    "maxScore"   DOUBLE PRECISION,
    "minScore"   DOUBLE PRECISION,
    "maxTime"    INTEGER,
    "createdAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "judging_criterions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "judging_criterions_templateId_idx" ON "judging_criterions"("templateId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'judging_criterions_templateId_fkey') THEN
    ALTER TABLE "judging_criterions" ADD CONSTRAINT "judging_criterions_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "judging_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── judging_options ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "judging_options" (
    "id"          TEXT             NOT NULL,
    "criterionId" TEXT             NOT NULL,
    "label"       TEXT             NOT NULL,
    "weight"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order"       INTEGER          NOT NULL DEFAULT 0,
    CONSTRAINT "judging_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "judging_options_criterionId_idx" ON "judging_options"("criterionId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'judging_options_criterionId_fkey') THEN
    ALTER TABLE "judging_options" ADD CONSTRAINT "judging_options_criterionId_fkey"
      FOREIGN KEY ("criterionId") REFERENCES "judging_criterions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
