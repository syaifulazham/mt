-- International registration is switched on per event (hand-scoped).
ALTER TABLE "events" ADD COLUMN "allowInternational" BOOLEAN NOT NULL DEFAULT false;

-- Keep it on where it is already in use: events with a foreign school's team
-- entered, or with a third-party registration link.
UPDATE "events" SET "allowInternational" = true
WHERE "id" IN (
  SELECT DISTINCT te."eventId"
  FROM "team_events" te
  JOIN "teams" t        ON t."id" = te."teamId"
  JOIN "contingents" c  ON c."id" = t."contingentId"
  JOIN "countries" co   ON co."id" = c."countryId"
  WHERE c."contingentType" = 'INTERNATIONAL' AND co."codeIso2" <> 'MY'
) OR "id" IN (SELECT "eventId" FROM "international_links");
