/**
 * Certificates → Generator: turn a recipient source into certificate rows for a
 * template's current version.
 *
 * Sources:
 *   EVENT_PARTICIPANTS — members of accepted teams of an event (+ confirmed
 *                        walk-in registrations), optionally attended only
 *   EVENT_WINNERS      — ranked members from the event's results, rank range,
 *                        verified judging only by default
 *   ALL_REGISTERED     — every registered participant (optionally by contingent type)
 *   CUSTOM             — rows pasted by the organizer
 *
 * Every source can override the event name printed on the certificate.
 * Jobs run in batches (offset/limit) so the page can show progress, and each
 * certificate carries meta.genKey so re-running a job never issues twice for
 * the same template.
 *
 * The certificate row is a snapshot (see the archival contract in AGENTS.md):
 * names are copied in, ids are soft references only.
 */
import { CertTargetType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computeCompetitionResults } from "@/lib/resultsRankings";
import { allocateSerial, newUniqueCode } from "./serial";

export const GENERATOR_SOURCES = ["EVENT_PARTICIPANTS", "EVENT_WINNERS", "ALL_REGISTERED", "CUSTOM"] as const;
export type GeneratorSource = (typeof GENERATOR_SOURCES)[number];

export type CustomRow = {
  name: string; ic?: string; contingent?: string; school?: string; state?: string;
  team?: string; competition?: string; competitionCode?: string; award?: string; rank?: number | null;
};

export type GeneratorConfig = {
  eventId?: string;
  /** Limit to these competition codes (empty / absent = all of the event's). */
  competitionCodes?: string[];
  attendedOnly?: boolean;              // EVENT_PARTICIPANTS
  rankFrom?: number; rankTo?: number;  // EVENT_WINNERS
  verifiedOnly?: boolean;              // EVENT_WINNERS (default true)
  contingentType?: string;             // ALL_REGISTERED: SCHOOL | HIGHER | INDEPENDENT | INTERNATIONAL
  rows?: CustomRow[];                  // CUSTOM
  /** Printed instead of the event's own name. */
  eventNameOverride?: string;
};

export type Recipient = {
  key: string;                         // stable per (source, event, competition, person)
  participantId: string | null;
  name: string; ic: string | null;
  contingentId: string | null; contingentName: string | null;
  schoolName: string | null; stateName: string | null;
  teamId: string | null; teamName: string | null;
  competitionId: string | null; competitionName: string | null; competitionCode: string | null;
  eventId: string | null; eventName: string | null;
  awardTitle: string | null; rank: number | null;
};

export const BATCH_SIZE = 250;

export function awardTitleForRank(rank: number): string {
  return rank === 1 ? "JOHAN" : rank === 2 ? "NAIB JOHAN" : rank === 3 ? "TEMPAT KETIGA" : `TEMPAT KE-${rank}`;
}

type PersonRow = {
  pid: string; name: string; ic: string | null;
  contingent_id: string | null; contingent_name: string | null; school_name: string | null; state_name: string | null;
};

// Contingent → school / state, resolved the way the rest of MT does (school, institution, own state)
const PERSON_JOINS = `
  JOIN contingents ct            ON ct.id = %CT%
  LEFT JOIN schools s            ON s.id = ct."schoolId"
  LEFT JOIN states ss            ON ss.id = s."stateId"
  LEFT JOIN higher_institutions hi ON hi.id = ct."higherInstitutionId"
  LEFT JOIN states hs            ON hs.id = hi."stateId"
  LEFT JOIN states cs            ON cs.id = ct."stateId"`;
const PERSON_COLS = `p.id AS pid, p.name, p.ic, ct.id AS contingent_id, ct.name AS contingent_name,
  COALESCE(s.name, hi.name) AS school_name, COALESCE(ss.name, hs.name, cs.name) AS state_name`;

async function eventName(cfg: GeneratorConfig): Promise<string | null> {
  if (cfg.eventNameOverride?.trim()) return cfg.eventNameOverride.trim();
  if (!cfg.eventId) return null;
  return (await db.event.findUnique({ where: { id: cfg.eventId }, select: { name: true } }))?.name ?? null;
}

/** One page of recipients plus the total, in a stable order. */
export async function resolveRecipients(
  source: GeneratorSource, cfg: GeneratorConfig, offset: number, limit: number,
): Promise<{ rows: Recipient[]; total: number }> {
  const evName = await eventName(cfg);
  const codes = cfg.competitionCodes?.length ? cfg.competitionCodes : null;

  if (source === "EVENT_PARTICIPANTS") {
    if (!cfg.eventId) throw new Error("Pilih acara.");
    const params: unknown[] = [cfg.eventId];
    const codeFilter = codes ? (params.push(codes), `AND c.code = ANY($${params.length})`) : "";
    const attended = cfg.attendedOnly ? `AND te."attendedAt" IS NOT NULL` : "";
    const sql = `
      SELECT * FROM (
        SELECT ${PERSON_COLS}, t.id AS team_id, t.name AS team_name, c.id AS comp_id, c.name AS comp_name, c.code AS comp_code
        FROM team_events te
        JOIN teams t         ON t.id = te."teamId"
        JOIN competitions c  ON c.id = t."competitionId"
        JOIN team_members tm ON tm."teamId" = t.id
        JOIN contestants p   ON p.id = tm."contestantId"
        ${PERSON_JOINS.replace("%CT%", `t."contingentId"`)}
        WHERE te."eventId" = $1 AND te.acceptance = 'ACCEPT' ${attended} ${codeFilter}
        UNION ALL
        SELECT ${PERSON_COLS}, NULL, NULL, c.id, c.name, c.code
        FROM walkin_registrations wr
        JOIN event_walkin_competitions wc ON wc.id = wr."walkInCompetitionId"
        JOIN competitions c  ON c.id = wc."competitionId"
        JOIN contestants p   ON p.id = wr."participantId"
        ${PERSON_JOINS.replace("%CT%", `wr."contingentId"`)}
        WHERE wc."eventId" = $1 AND wr.status = 'CONFIRMED' ${codeFilter}
      ) x`;
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM (${sql}) y`, ...params);
    const rows = await db.$queryRawUnsafe<(PersonRow & { team_id: string | null; team_name: string | null; comp_id: string; comp_name: string; comp_code: string })[]>(
      `${sql} ORDER BY comp_code, team_name NULLS LAST, name, pid OFFSET ${offset} LIMIT ${limit}`, ...params);
    return {
      total: n,
      rows: rows.map(r => ({
        key: `part:${cfg.eventId}:${r.comp_id}:${r.pid}`,
        participantId: r.pid, name: r.name, ic: r.ic,
        contingentId: r.contingent_id, contingentName: r.contingent_name, schoolName: r.school_name, stateName: r.state_name,
        teamId: r.team_id, teamName: r.team_name,
        competitionId: r.comp_id, competitionName: r.comp_name, competitionCode: r.comp_code,
        eventId: cfg.eventId!, eventName: evName, awardTitle: null, rank: null,
      })),
    };
  }

  if (source === "EVENT_WINNERS") {
    if (!cfg.eventId) throw new Error("Pilih acara.");
    const from = Math.max(1, cfg.rankFrom ?? 1), to = Math.max(from, cfg.rankTo ?? 3);
    const verifiedOnly = cfg.verifiedOnly !== false;
    const results = [
      ...await computeCompetitionResults(cfg.eventId, false, null),
      ...await computeCompetitionResults(cfg.eventId, true, null),
    ].filter(r => (!codes || codes.includes(r.code)) && (!verifiedOnly || r.judgingStatus === "VERIFIED"));

    const entries = results.flatMap(r => r.rankings
      .filter(e => e.rank >= from && e.rank <= to)
      .flatMap(e => e.members.map(m => ({ r, e, pid: m.id }))));
    entries.sort((a, b) => a.r.code.localeCompare(b.r.code) || a.e.rank - b.e.rank || a.e.teamName.localeCompare(b.e.teamName));
    const page = entries.slice(offset, offset + limit);

    const people = page.length ? await db.$queryRawUnsafe<PersonRow[]>(`
      SELECT ${PERSON_COLS} FROM contestants p ${PERSON_JOINS.replace("%CT%", `p."contingentId"`)}
      WHERE p.id = ANY($1)`, page.map(x => x.pid)) : [];
    const byId = new Map(people.map(p => [p.pid, p]));
    const compIds = new Map((await db.competition.findMany({
      where: { code: { in: [...new Set(page.map(x => x.r.code))] } }, select: { id: true, code: true },
    })).map(c => [c.code, c.id]));

    return {
      total: entries.length,
      rows: page.map(({ r, e, pid }) => {
        const p = byId.get(pid);
        return {
          key: `win:${cfg.eventId}:${r.code}:${pid}`,
          participantId: pid, name: p?.name ?? e.members.find(m => m.id === pid)?.name ?? "", ic: p?.ic ?? null,
          contingentId: e.contingentId, contingentName: e.contingentName,
          schoolName: p?.school_name ?? null, stateName: e.stateName ?? p?.state_name ?? null,
          teamId: e.teamId, teamName: e.teamName,
          competitionId: compIds.get(r.code) ?? null, competitionName: r.name, competitionCode: r.code,
          eventId: cfg.eventId!, eventName: evName, awardTitle: awardTitleForRank(e.rank), rank: e.rank,
        };
      }),
    };
  }

  if (source === "ALL_REGISTERED") {
    const params: unknown[] = [];
    const typeFilter = cfg.contingentType ? (params.push(cfg.contingentType), `WHERE ct."contingentType"::text = $1`) : "";
    const sql = `SELECT ${PERSON_COLS} FROM contestants p ${PERSON_JOINS.replace("%CT%", `p."contingentId"`)} ${typeFilter}`;
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM (${sql}) y`, ...params);
    const rows = await db.$queryRawUnsafe<PersonRow[]>(`${sql} ORDER BY p.id OFFSET ${offset} LIMIT ${limit}`, ...params);
    return {
      total: n,
      rows: rows.map(r => ({
        key: `all:${r.pid}`,
        participantId: r.pid, name: r.name, ic: r.ic,
        contingentId: r.contingent_id, contingentName: r.contingent_name, schoolName: r.school_name, stateName: r.state_name,
        teamId: null, teamName: null, competitionId: null, competitionName: null, competitionCode: null,
        eventId: cfg.eventId ?? null, eventName: evName, awardTitle: null, rank: null,
      })),
    };
  }

  // CUSTOM
  const all = (cfg.rows ?? []).filter(r => r.name?.trim());
  return {
    total: all.length,
    rows: all.slice(offset, offset + limit).map(r => {
      const norm = (v?: string | null) => (v ?? "").trim().toUpperCase();
      return {
        key: `custom:${norm(r.name)}:${norm(r.ic)}:${norm(r.competitionCode ?? r.competition)}`,
        participantId: null, name: r.name.trim(), ic: r.ic?.trim() || null,
        contingentId: null, contingentName: r.contingent?.trim() || null, schoolName: r.school?.trim() || null,
        stateName: r.state?.trim() || null, teamId: null, teamName: r.team?.trim() || null,
        competitionId: null, competitionName: r.competition?.trim() || null, competitionCode: r.competitionCode?.trim() || null,
        eventId: cfg.eventId ?? null, eventName: evName,
        awardTitle: r.award?.trim() || (r.rank ? awardTitleForRank(r.rank) : null), rank: r.rank ?? null,
      };
    }),
  };
}

/**
 * Issue one batch: certificates for `rows` against the template's current
 * version, skipping recipients already issued for this template.
 */
export async function issueBatch(opts: {
  jobId: string; templateId: string; rows: Recipient[]; createdBy: string;
}): Promise<{ created: number; skipped: number }> {
  const template = await db.certTemplate.findUnique({
    where: { id: opts.templateId },
    include: { season: { select: { id: true, serialPrefix: true, archivedAt: true } } },
  });
  if (!template) throw new Error("Templat tidak dijumpai.");
  if (!template.currentVersionId) throw new Error("Templat belum diterbitkan (publish) — tiada versi untuk dijana.");
  if (template.season.archivedAt) throw new Error("Musim templat ini telah diarkibkan.");

  const genKeys = opts.rows.map(r => `${template.id}:${r.key}`);
  const existing = genKeys.length ? await db.$queryRaw<{ k: string }[]>`
    SELECT meta->>'genKey' AS k FROM certificates WHERE meta->>'genKey' = ANY(${genKeys})` : [];
  const done = new Set(existing.map(e => e.k));
  const todo = opts.rows.filter((_, i) => !done.has(genKeys[i]));
  const now = new Date();

  await db.$transaction(async (tx) => {
    for (const r of todo) {
      const serialNumber = await allocateSerial(tx, template.season, template.targetType as CertTargetType);
      await tx.certificate.create({
        data: {
          seasonId: template.seasonId, templateVersionId: template.currentVersionId!,
          serialNumber, uniqueCode: newUniqueCode(), status: "READY", issuedAt: now,
          recipientName: r.name, recipientType: r.participantId ? "PARTICIPANT" : "OTHER", recipientIc: r.ic,
          contingentName: r.contingentName, schoolName: r.schoolName, stateName: r.stateName, teamName: r.teamName,
          competitionName: r.competitionName, competitionCode: r.competitionCode, eventName: r.eventName,
          awardTitle: r.awardTitle, rank: r.rank,
          meta: { genKey: `${template.id}:${r.key}`, jobId: opts.jobId } as Prisma.InputJsonValue,
          participantId: r.participantId, contingentId: r.contingentId, teamId: r.teamId,
          eventId: r.eventId, competitionId: r.competitionId, createdBy: opts.createdBy,
        },
      });
    }
  }, { timeout: 120_000 });

  return { created: todo.length, skipped: opts.rows.length - todo.length };
}
