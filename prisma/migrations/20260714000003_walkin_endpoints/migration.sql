-- Create walkin_endpoints table
CREATE TABLE "walkin_endpoints" (
  "id" TEXT NOT NULL,
  "walkInCompetitionId" TEXT NOT NULL,
  "routeSlug" TEXT NOT NULL,
  "passcode" TEXT NOT NULL,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "walkin_endpoints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "walkin_endpoints_routeSlug_key" ON "walkin_endpoints"("routeSlug");
ALTER TABLE "walkin_endpoints" ADD CONSTRAINT "walkin_endpoints_walkInCompetitionId_fkey"
  FOREIGN KEY ("walkInCompetitionId") REFERENCES "event_walkin_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any existing active endpoints to the new table
INSERT INTO "walkin_endpoints" ("id", "walkInCompetitionId", "routeSlug", "passcode", "label", "active", "createdAt")
SELECT gen_random_uuid()::text, "id", "routeSlug", "passcode", 'Kaunter 1', true, NOW()
FROM "event_walkin_competitions"
WHERE "endpointActive" = true AND "routeSlug" IS NOT NULL AND "passcode" IS NOT NULL;

-- Remove old single-endpoint columns
ALTER TABLE "event_walkin_competitions" DROP COLUMN IF EXISTS "routeSlug";
ALTER TABLE "event_walkin_competitions" DROP COLUMN IF EXISTS "passcode";
ALTER TABLE "event_walkin_competitions" DROP COLUMN IF EXISTS "endpointActive";
