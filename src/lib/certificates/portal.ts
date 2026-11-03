// Certificates on the manager / participant portals. A certificate is shown
// only when (a) its portal is switched on under Certificates → Distribution,
// (b) it is READY (not revoked), and (c) its generator gave it a distribution
// level (meta.distLevel = SCHOOL | STATE | NATIONAL) — that level is the
// column it appears under.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCertDistribution } from "./distribution";

export const PORTAL_LEVELS = ["SCHOOL", "STATE", "NATIONAL"] as const;
export type PortalLevel = (typeof PORTAL_LEVELS)[number];

const ACHIEVEMENT_TYPES = ["EVENT_WINNER", "QUIZ_WINNER", "SCHOOL_WINNER"];

export type PortalCert = {
  id: string; serialNumber: string; level: PortalLevel; kind: "PARTICIPATION" | "ACHIEVEMENT";
  label: string; // e.g. "6.3R Cabaran Siasatan Jenayah · TEMPAT PERTAMA"
  online: boolean; // issued for an online event (scope ONLINE_*)
};

type Row = {
  id: string; serialNumber: string; participantId: string | null; recipientName: string;
  competitionCode: string | null; competitionName: string | null; awardTitle: string | null;
  eventName: string | null; level: string; targetType: string; online: boolean;
};

function toPortalCert(r: Row): PortalCert {
  const comp = [r.competitionCode, r.competitionName].filter(Boolean).join(" ");
  return {
    id: r.id, serialNumber: r.serialNumber, level: r.level as PortalLevel,
    kind: ACHIEVEMENT_TYPES.includes(r.targetType) || r.awardTitle ? "ACHIEVEMENT" : "PARTICIPATION",
    label: [comp || r.eventName, r.awardTitle].filter(Boolean).join(" · ") || r.serialNumber,
    online: !!r.online,
  };
}

/** Distributed certificates of the given contingents (manager portal). */
export async function distributedCertificates(where: { contingentIds?: string[]; participantId?: string }): Promise<(PortalCert & { participantId: string | null; recipientName: string })[]> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`c.status = 'READY'`,
    Prisma.sql`c.meta->>'distLevel' IN ('SCHOOL', 'STATE', 'NATIONAL')`,
  ];
  if (where.contingentIds) {
    if (!where.contingentIds.length) return [];
    conds.push(Prisma.sql`c."contingentId" IN (${Prisma.join(where.contingentIds)})`);
  }
  if (where.participantId) conds.push(Prisma.sql`c."participantId" = ${where.participantId}`);
  const rows = await db.$queryRaw<Row[]>`
    SELECT c.id, c."serialNumber", c."participantId", c."recipientName", c."competitionCode", c."competitionName",
           c."awardTitle", c."eventName", c.meta->>'distLevel' AS level, t."targetType"::text AS "targetType",
           -- flag stored at issue time; older certificates fall back to the event's scope (if it still exists)
           COALESCE((c.meta->>'online')::boolean, e.scope::text LIKE 'ONLINE%', false) AS online
    FROM certificates c
    JOIN cert_template_versions v ON v.id = c."templateVersionId"
    JOIN cert_templates t          ON t.id = v."templateId"
    LEFT JOIN events e             ON e.id = c."eventId"
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY c."competitionCode" NULLS LAST, c."serialNumber"`;
  return rows.map(r => ({ ...toPortalCert(r), participantId: r.participantId, recipientName: r.recipientName }));
}

/** Contingent ids a Clerk manager may see certificates for. */
export async function managerContingentIds(clerkUserId: string): Promise<string[] | null> {
  const m = await db.managerProfile.findUnique({
    where: { clerkUserId }, select: { contingentManagers: { select: { contingentId: true } } },
  });
  return m ? m.contingentManagers.map(c => c.contingentId) : null;
}

/** Whether a portal may serve this certificate (distribution on + level set + READY). */
export async function portalMayServe(portal: "manager" | "participant", meta: unknown, status: string): Promise<boolean> {
  if (status !== "READY") return false;
  const level = (meta as { distLevel?: string } | null)?.distLevel;
  if (!level || !(PORTAL_LEVELS as readonly string[]).includes(level)) return false;
  const d = await getCertDistribution();
  return portal === "manager" ? d.manager : d.participant;
}

// ── One participant, every season (manager portal → participant page) ───────

export type SeasonCert = PortalCert & { seasonYear: number; seasonName: string; archived: boolean; eventName: string | null };

/**
 * All of a participant's certificates, newest season first. Current seasons
 * show distributed certificates (as on the certificates page); archived seasons
 * — e.g. Techlympics 2025, imported from mt25 — show every READY certificate,
 * matched by IC number because those rows predate participant ids.
 */
export async function participantCertificatesAllSeasons(p: { id: string; ic: string | null }): Promise<SeasonCert[]> {
  const icDigits = (p.ic ?? "").replace(/\D/g, "");
  const byIc = icDigits.length >= 6
    ? Prisma.sql`OR (s."archivedAt" IS NOT NULL AND regexp_replace(COALESCE(c."recipientIc", ''), '\\D', '', 'g') = ${icDigits})`
    : Prisma.empty;
  const rows = await db.$queryRaw<(Row & { seasonYear: number; seasonName: string; archived: boolean; distLevel: string | null })[]>`
    SELECT c.id, c."serialNumber", c."participantId", c."recipientName", c."competitionCode", c."competitionName",
           c."awardTitle", c."eventName", COALESCE(c.meta->>'distLevel', 'NONE') AS level, t."targetType"::text AS "targetType",
           COALESCE((c.meta->>'online')::boolean, e.scope::text LIKE 'ONLINE%', false) AS online,
           s.year AS "seasonYear", s.name AS "seasonName", s."archivedAt" IS NOT NULL AS archived
    FROM certificates c
    JOIN seasons s                 ON s.id = c."seasonId"
    JOIN cert_template_versions v  ON v.id = c."templateVersionId"
    JOIN cert_templates t          ON t.id = v."templateId"
    LEFT JOIN events e             ON e.id = c."eventId"
    WHERE c.status = 'READY'
      AND (
        (s."archivedAt" IS NULL AND c."participantId" = ${p.id} AND c.meta->>'distLevel' IN ('SCHOOL', 'STATE', 'NATIONAL'))
        ${byIc}
      )
    ORDER BY s.year DESC, c."competitionCode" NULLS LAST, c."serialNumber"`;
  return rows.map(r => ({ ...toPortalCert(r), seasonYear: r.seasonYear, seasonName: r.seasonName, archived: r.archived, eventName: r.eventName }));
}

/** Manager access to an archived-season certificate: its IC belongs to one of the manager's participants. */
export async function managerOwnsByIc(contingentIds: string[], recipientIc: string | null): Promise<boolean> {
  const digits = (recipientIc ?? "").replace(/\D/g, "");
  if (digits.length < 6 || !contingentIds.length) return false;
  const [hit] = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM contestants
    WHERE "contingentId" IN (${Prisma.join(contingentIds)}) AND regexp_replace(COALESCE(ic, ''), '\\D', '', 'g') = ${digits}`;
  return (hit?.n ?? 0) > 0;
}
