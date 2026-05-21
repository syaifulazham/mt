-- Add location columns to events that were added via db push and never migrated
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "city"      TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
