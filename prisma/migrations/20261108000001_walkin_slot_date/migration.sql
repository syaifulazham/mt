-- Walk-in slots on multi-day events: a slot is (date, session, slot).
-- "" = no date (one-day events and every booking made before this).
ALTER TABLE "walkin_registrations"    ADD COLUMN IF NOT EXISTS "slotDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "walkin_form_submissions" ADD COLUMN IF NOT EXISTS "slotDate" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "walkin_registrations_slot_unique";
CREATE UNIQUE INDEX "walkin_registrations_slot_unique"
  ON "walkin_registrations"("walkInCompetitionId", "slotDate", "sessionNumber", "slotNumber")
  WHERE "status" IN ('PENDING', 'CONFIRMED') AND "sessionNumber" IS NOT NULL;

DROP INDEX IF EXISTS "walkin_form_submissions_slot_unique";
CREATE UNIQUE INDEX "walkin_form_submissions_slot_unique"
  ON "walkin_form_submissions"("walkInCompetitionId", "slotDate", "sessionNumber", "slotNumber")
  WHERE "sessionNumber" IS NOT NULL;
