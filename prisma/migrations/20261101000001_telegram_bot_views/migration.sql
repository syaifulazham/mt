-- Telegram bot: read-only views in a separate "bot" schema.
--
-- Hand-scoped per AGENTS.md: this migration only creates the bot schema and
-- its views. It touches no existing table, column or type. Prisma ignores the
-- "bot" schema (it is not in the datasource's schemas), so it causes no drift.
--
-- These views are the ONLY thing the bot can read (role bot_ro, see
-- create_bot_ro_role.sql). Column names below are the bot's contract
-- (techlympics-bot/src/mt/repo.ts) — rename underlying columns freely, but keep
-- the view output names.
--
-- PDPA: no contestant IC, email, phone, ethnicity, password hash; no manager
-- phone/ID/address; no LMS passwords. Contestant names are never exposed.

CREATE SCHEMA IF NOT EXISTS bot;

-- ── Accounts that can link to Telegram ──────────────────────────────────────

-- Teachers / contingent managers (Clerk). Only ACTIVE memberships of ACTIVE contingents count.
CREATE OR REPLACE VIEW bot.manager_accounts AS
SELECT
  mp.id                                                     AS account_id,
  mp.name                                                   AS full_name,
  COALESCE(array_agg(c.id   ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '{}') AS contingent_ids,
  COALESCE(array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '{}') AS contingent_names
FROM manager_profiles mp
LEFT JOIN contingent_managers cm
       ON cm."managerId" = mp.id AND cm.status = 'ACTIVE'
LEFT JOIN contingents c
       ON c.id = cm."contingentId" AND c.status = 'ACTIVE'
WHERE mp."deletedAt" IS NULL
GROUP BY mp.id, mp.name;

-- Organisers / judge coordinators (Auth.js).
CREATE OR REPLACE VIEW bot.organizer_accounts AS
SELECT
  ou.id          AS account_id,
  ou.name        AS full_name,
  ou.role::text  AS org_role,
  (ou."isActive" AND ou."deletedAt" IS NULL) AS active
FROM organizer_users ou;

-- ── Public catalogue ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bot.events AS
SELECT
  e.id,
  e.name,
  e.slug,
  e.scope::text            AS scope,
  st.name                  AS state,
  z.name                   AS zone,
  e.venue,
  e.address,
  e.city,
  e."startDate"            AS start_date,
  e."endDate"              AS end_date,
  e."registrationStart"    AS registration_start,
  e."registrationEnd"      AS registration_end,
  e.status::text           AS status
FROM events e
LEFT JOIN states st ON st.id = e."stateId"
LEFT JOIN zones  z  ON z.id  = e."zoneId"
WHERE e.status IN ('PUBLISHED', 'ACTIVE', 'COMPLETED');

CREATE OR REPLACE VIEW bot.competitions AS
SELECT
  c.id,
  c.code,
  c.name,
  c.description,
  th.name                               AS theme,
  c."participationType"::text           AS participation_type,
  c."minTeamSize"                       AS min_team_size,
  c."maxTeamSize"                       AS max_team_size,
  c."maxParticipantsPerContingent"      AS max_per_contingent,
  c.venue,
  c."startDate"                         AS start_date,
  c."endDate"                           AS end_date,
  c."registrationStart"                 AS registration_start,
  c."registrationEnd"                   AS registration_end,
  (SELECT string_agg(tg.name, ', ' ORDER BY tg.name)
     FROM competition_target_groups ctg
     JOIN target_groups tg ON tg.id = ctg."targetGroupId"
    WHERE ctg."competitionId" = c.id)   AS target_groups,
  (SELECT string_agg(e.name, ', ' ORDER BY e."startDate" NULLS LAST)
     FROM event_competitions ec
     JOIN events e ON e.id = ec."eventId"
    WHERE ec."competitionId" = c.id
      AND e.status IN ('PUBLISHED', 'ACTIVE', 'COMPLETED')) AS events
FROM competitions c
LEFT JOIN themes th ON th.id = c."themeId";

-- ── Registrations: one row per team, no personal data ───────────────────────

CREATE OR REPLACE VIEW bot.team_registrations AS
SELECT
  t.id                                   AS team_id,
  t.name                                 AS team_name,
  t.status                               AS status,
  t."contingentId"                       AS contingent_id,
  ct.name                                AS contingent_name,
  ct."contingentType"::text              AS contingent_type,
  ct.locality::text                      AS locality,
  COALESCE(cst.name, sst.name)           AS state,
  z.name                                 AS zone,
  s.category::text                       AS school_category,
  s.level::text                          AS school_level,
  comp.code                              AS competition_code,
  comp.name                              AS competition_name,
  th.name                                AS theme,
  (SELECT count(*) FROM team_members tm WHERE tm."teamId" = t.id)::int AS member_count,
  (SELECT string_agg(e.name || CASE WHEN te.selected THEN ' (dipilih)' ELSE '' END, ', ' ORDER BY e."startDate" NULLS LAST)
     FROM team_events te
     JOIN events e ON e.id = te."eventId"
    WHERE te."teamId" = t.id)            AS events,
  t."updatedAt"                          AS updated_at
FROM teams t
JOIN contingents ct      ON ct.id = t."contingentId"
JOIN competitions comp   ON comp.id = t."competitionId"
LEFT JOIN themes th      ON th.id = comp."themeId"
LEFT JOIN schools s      ON s.id = ct."schoolId"
LEFT JOIN states cst     ON cst.id = ct."stateId"
LEFT JOIN states sst     ON sst.id = s."stateId"
LEFT JOIN zones z        ON z.id = COALESCE(ct."zoneId", s."zoneId")
WHERE ct.status = 'ACTIVE';

-- ── Content ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bot.knowledge AS
SELECT kb.path, kb.title, kb.content, kb."updatedAt" AS updated_at
FROM knowledge_base kb;

CREATE OR REPLACE VIEW bot.announcements AS
SELECT a.id, a.title, a.content, a."coverUrl" AS cover_url, a."publishedAt" AS published_at
FROM announcements a
WHERE a."isPublished" AND a."publishedAt" IS NOT NULL;
