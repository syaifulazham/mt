-- AlterTable
ALTER TABLE "walkin_registrations"
  ADD COLUMN IF NOT EXISTS "sessionNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "slotNumber" INTEGER;

-- One active booking per (competition, session, slot)
CREATE UNIQUE INDEX IF NOT EXISTS "walkin_registrations_slot_unique"
  ON "walkin_registrations"("walkInCompetitionId", "sessionNumber", "slotNumber")
  WHERE "status" IN ('PENDING', 'CONFIRMED') AND "sessionNumber" IS NOT NULL;
