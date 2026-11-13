-- International registration lists are per event (hand-scoped).
ALTER TABLE "contingents" ADD COLUMN "internationalEventId" TEXT;
ALTER TABLE "events" ADD COLUMN "internationalCountryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "contingents_internationalEventId_idx" ON "contingents"("internationalEventId");

-- The event that already uses international registration: the one with the
-- most foreign schools' teams entered, else the oldest with a third-party link,
-- else the oldest with the option switched on.
CREATE TEMP TABLE "international_main" AS
SELECT COALESCE(
  (SELECT te."eventId" FROM "team_events" te JOIN "teams" t ON t."id" = te."teamId"
     JOIN "contingents" c ON c."id" = t."contingentId" JOIN "countries" co ON co."id" = c."countryId"
   WHERE c."contingentType" = 'INTERNATIONAL' AND co."codeIso2" <> 'MY'
   GROUP BY te."eventId" ORDER BY count(*) DESC LIMIT 1),
  (SELECT "eventId" FROM "international_links" ORDER BY "createdAt" LIMIT 1),
  (SELECT "id" FROM "events" WHERE "allowInternational" ORDER BY "createdAt" LIMIT 1)
) AS "eventId";

-- Each existing foreign school goes to the event it is used in: where its teams
-- are entered; else the event of the third-party link that created it; else the
-- earliest event with international registration switched on.
WITH foreign_schools AS (
  SELECT c."id" FROM "contingents" c JOIN "countries" co ON co."id" = c."countryId"
  WHERE c."contingentType" = 'INTERNATIONAL' AND co."codeIso2" <> 'MY'
), by_entry AS (
  SELECT DISTINCT ON (t."contingentId") t."contingentId" AS cid, te."eventId"
  FROM "team_events" te JOIN "teams" t ON t."id" = te."teamId"
  WHERE t."contingentId" IN (SELECT "id" FROM foreign_schools)
  ORDER BY t."contingentId", te."createdAt"
), by_link AS (
  SELECT DISTINCT ON (x.cid) x.cid, l."eventId"
  FROM "international_links" l, unnest(l."contingentIds") AS x(cid)
  ORDER BY x.cid, l."createdAt"
), fallback AS (
  SELECT "eventId" FROM "international_main"
)
UPDATE "contingents" c SET "internationalEventId" = COALESCE(
  (SELECT "eventId" FROM by_entry WHERE cid = c."id"),
  (SELECT "eventId" FROM by_link  WHERE cid = c."id"),
  (SELECT "eventId" FROM fallback)
)
WHERE c."id" IN (SELECT "id" FROM foreign_schools);

-- Countries per event: those of its schools; the event that already uses
-- international registration keeps every foreign country it listed until now.
UPDATE "events" e SET "internationalCountryIds" = ARRAY(
  SELECT DISTINCT c."countryId" FROM "contingents" c
  WHERE c."internationalEventId" = e."id" AND c."countryId" IS NOT NULL
  UNION
  SELECT co."id" FROM "countries" co
  WHERE co."codeIso2" <> 'MY' AND co."isActive"
    AND e."id" = (SELECT "eventId" FROM "international_main")
);

DROP TABLE "international_main";
