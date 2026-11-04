-- International participants registered by organizers: passport in place of
-- the IC, and a birth date in place of the IC-derived age. Hand-scoped: only
-- the new columns (see AGENTS.md on schema drift).
ALTER TABLE "contestants" ADD COLUMN "passport" TEXT;
ALTER TABLE "contestants" ADD COLUMN "birthDate" DATE;
ALTER TABLE "trainers" ADD COLUMN "passport" TEXT;
