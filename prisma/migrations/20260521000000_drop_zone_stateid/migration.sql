-- zones.stateId was the original single-state FK.
-- The schema was later changed to use the zone_states join table instead,
-- but this column was never dropped. Remove it now so zone.create() works.

ALTER TABLE "zones" DROP CONSTRAINT IF EXISTS "zones_stateId_fkey";
ALTER TABLE "zones" DROP COLUMN IF EXISTS "stateId";
