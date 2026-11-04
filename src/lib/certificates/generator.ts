/**
 * Certificates → Generator: turn a recipient source into certificate rows for a
 * template's current version.
 *
 * Sources:
 *   EVENT_PARTICIPANTS — members of accepted teams of an event (online events:
 *                        every team not rejected) + confirmed walk-in
 *                        registrations, optionally attended only
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
import { computeCompetitionResults, internationalRankings, type RankingEntry } from "@/lib/resultsRankings";
import { allocateSerial, newUniqueCode } from "./serial";

export const GENERATOR_SOURCES = ["EVENT_PARTICIPANTS", "EVENT_WINNERS", "ALL_REGISTERED", "TRAINERS", "MANAGERS", "CUSTOM"] as const;
export type GeneratorSource = (typeof GENERATOR_SOURCES)[number];

/** Where issued certificates are offered on the portals (Certificates → Distribution). */
export const DISTRIBUTION_LEVELS = ["NONE", "SCHOOL", "STATE", "NATIONAL"] as const;
export type DistributionLevel = (typeof DISTRIBUTION_LEVELS)[number];
export const DISTRIBUTION_LABEL: Record<DistributionLevel, string> = {
  NONE: "Tiada", SCHOOL: "Peringkat Sekolah", STATE: "Peringkat Negeri", NATIONAL: "Peringkat Kebangsaan",
};

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
  /**
   * EVENT_WINNERS: rank across the whole event (local teams), within each
   * state, or INTERNATIONAL — the Antarabangsa ranking (top 2 of each country,
   * Malaysia included, ranked together; see internationalRankings).
   */
  resultsBy?: "NATIONAL" | "STATE" | "INTERNATIONAL";
  contingentType?: string;             // ALL_REGISTERED: SCHOOL | HIGHER | INDEPENDENT | INTERNATIONAL
  rows?: CustomRow[];                  // CUSTOM
  /** Printed instead of the event's own name. */
  eventNameOverride?: string;
  /** Portal column the certificates appear under; NONE = not distributed. */
  distributionLevel?: DistributionLevel;
};

export type Recipient = {
  key: string;                         // stable per (source, event, competition, person)
  recipientType?: "PARTICIPANT" | "TRAINER" | "MANAGER" | "OTHER";
  participantId: string | null;
  name: string; ic: string | null;
  contingentId: string | null; contingentName: string | null;
  schoolName: string | null; stateName: string | null;
  /** Foreign recipients' country; Malaysia too in INTERNATIONAL results. */
  countryName?: string | null;
  teamId: string | null; teamName: string | null;
  competitionId: string | null; competitionName: string | null; competitionCode: string | null;
  eventId: string | null; eventName: string | null;
  awardTitle: string | null; rank: number | null;
};

export const BATCH_SIZE = 250;

export function awardTitleForRank(rank: number): string {
  return rank === 1 ? "TEMPAT PERTAMA" : `TEMPAT KE-${rank}`;
}

type PersonRow = {
  pid: string; name: string; ic: string | null;
  contingent_id: string | null; contingent_name: string | null; school_name: string | null; state_name: string | null;
  country_name: string | null;
};

// Contingent → school / state, resolved the way the rest of MT does (school, institution, own state)
const PERSON_JOINS = `
  JOIN contingents ct            ON ct.id = %CT%
  LEFT JOIN schools s            ON s.id = ct."schoolId"
  LEFT JOIN states ss            ON ss.id = s."stateId"
  LEFT JOIN higher_institutions hi ON hi.id = ct."higherInstitutionId"
  LEFT JOIN states hs            ON hs.id = hi."stateId"
  LEFT JOIN states cs            ON cs.id = ct."stateId"
  LEFT JOIN countries co         ON co.id = ct."countryId"`;
/** A foreign contingent's country (none for Malaysian ones). */
const COUNTRY_COL = `CASE WHEN co."codeIso2" <> 'MY' THEN co.name END AS country_name`;
const PERSON_COLS = `p.id AS pid, p.name, p.ic, ct.id AS contingent_id, ct.name AS contingent_name,
  COALESCE(s.name, hi.name) AS school_name, COALESCE(ss.name, hs.name, cs.name) AS state_name, ${COUNTRY_COL}`;

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
    // Physical events accept teams one by one; online events never do (their
    // teams stay PENDING), so there every team that isn't rejected takes part.
    const scope = (await db.event.findUnique({ where: { id: cfg.eventId }, select: { scope: true } }))?.scope ?? "";
    const accepted = String(scope).startsWith("ONLINE") ? `te.acceptance <> 'REJECT'` : `te.acceptance = 'ACCEPT'`;
    const sql = `
      SELECT * FROM (
        SELECT ${PERSON_COLS}, t.id AS team_id, t.name AS team_name, c.id AS comp_id, c.name AS comp_name, c.code AS comp_code
        FROM team_events te
        JOIN teams t         ON t.id = te."teamId"
        JOIN competitions c  ON c.id = t."competitionId"
        JOIN team_members tm ON tm."teamId" = t.id
        JOIN contestants p   ON p.id = tm."contestantId"
        ${PERSON_JOINS.replace("%CT%", `t."contingentId"`)}
        WHERE te."eventId" = $1 AND ${accepted} ${attended} ${codeFilter}
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
        countryName: r.country_name,
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
    const byState = cfg.resultsBy === "STATE";
    const intl    = cfg.resultsBy === "INTERNATIONAL";
    const results = [
      ...await computeCompetitionResults(cfg.eventId, false, null),
      ...await computeCompetitionResults(cfg.eventId, true, null),
    ].filter(r => !codes || codes.includes(r.code));

    // National: the event-wide rank. By state: re-rank each state's entries in
    // the same order (rankings are already sorted by score, then best time).
    // "Verified only" means the competition — or, by state, that state's own
    // judging row — is VERIFIED.
    //
    // International: the Antarabangsa ranking, with its own release rules —
    // Malaysia's teams once the competition is VERIFIED, foreign teams once its
    // Antarabangsa scope (or the competition) is. Without "verified only",
    // both parts are taken as they stand.
    const ranked = results.flatMap((r): { r: typeof r; e: RankingEntry; rank: number }[] => {
      if (intl)
        return internationalRankings(verifiedOnly ? r : { ...r, judgingStatus: "VERIFIED" }).map(e => ({ r, e, rank: e.rank }));
      if (!byState)
        return verifiedOnly && r.judgingStatus !== "VERIFIED" ? [] : r.rankings.map(e => ({ r, e, rank: e.rank }));
      const perState = new Map<string, number>();
      return r.rankings.flatMap(e => {
        const st = e.stateId ?? "-";
        const rank = (perState.get(st) ?? 0) + 1;
        perState.set(st, rank);
        const verified = r.judgingStatus === "VERIFIED" || (!!e.stateId && r.verifiedStateIds.includes(e.stateId));
        return verifiedOnly && !verified ? [] : [{ r, e, rank }];
      });
    });
    const entries = ranked
      .filter(x => x.rank >= from && x.rank <= to)
      .flatMap(x => x.e.members.map(m => ({ ...x, pid: m.id })));
    entries.sort((a, b) => a.r.code.localeCompare(b.r.code)
      || (byState ? (a.e.stateName ?? "").localeCompare(b.e.stateName ?? "") : 0)
      || a.rank - b.rank || a.e.teamName.localeCompare(b.e.teamName));
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
      rows: page.map(({ r, e, pid, rank }) => {
        const p = byId.get(pid);
        return {
          // International awards are a separate achievement from the national /
          // state ones, so they get their own key: a Malaysian winner in both
          // gets two certificates on the same template, never one overwritten.
          key: `${intl ? "win-intl" : "win"}:${cfg.eventId}:${r.code}:${pid}`,
          participantId: pid, name: p?.name ?? e.members.find(m => m.id === pid)?.name ?? "", ic: p?.ic ?? null,
          contingentId: e.contingentId, contingentName: e.contingentName,
          schoolName: p?.school_name ?? null, stateName: e.stateName ?? p?.state_name ?? null,
          countryName: e.countryName ?? p?.country_name ?? null,
          teamId: e.teamId, teamName: e.teamName,
          competitionId: compIds.get(r.code) ?? null, competitionName: r.name, competitionCode: r.code,
          eventId: cfg.eventId!, eventName: evName, awardTitle: awardTitleForRank(rank), rank,
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
        countryName: r.country_name,
        teamId: null, teamName: null, competitionId: null, competitionName: null, competitionCode: null,
        eventId: cfg.eventId ?? null, eventName: evName, awardTitle: null, rank: null,
      })),
    };
  }

  if (source === "TRAINERS" || source === "MANAGERS") {
    // Not tied to an event: every registered trainer, or every Contingent
    // Manager Portal user (one certificate per person, with their first
    // contingent printed). Only the event-name override applies.
    const sql = source === "TRAINERS"
      ? `SELECT tr.id AS pid, tr.name, tr.ic, ct.id AS contingent_id, ct.name AS contingent_name,
                COALESCE(s.name, hi.name) AS school_name, COALESCE(ss.name, hs.name, cs.name) AS state_name, ${COUNTRY_COL}
         FROM trainers tr ${PERSON_JOINS.replace("%CT%", `tr."contingentId"`)}`
      : `SELECT mp.id AS pid, mp.name, NULL::text AS ic, ct.id AS contingent_id, ct.name AS contingent_name,
                COALESCE(s.name, hi.name) AS school_name, COALESCE(ss.name, hs.name, cs.name) AS state_name, ${COUNTRY_COL}
         FROM manager_profiles mp
         LEFT JOIN LATERAL (
           SELECT cm."contingentId" FROM contingent_managers cm
           WHERE cm."managerId" = mp.id AND cm.status = 'ACTIVE' ORDER BY cm."createdAt" LIMIT 1
         ) first_cm ON true
         ${PERSON_JOINS.replace("JOIN contingents ct ", "LEFT JOIN contingents ct ").replace("%CT%", `first_cm."contingentId"`)}
         WHERE mp."deletedAt" IS NULL`;
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM (${sql}) y`);
    const rows = await db.$queryRawUnsafe<PersonRow[]>(`${sql} ORDER BY state_name NULLS LAST, contingent_name NULLS LAST, name, pid OFFSET ${offset} LIMIT ${limit}`);
    const trainers = source === "TRAINERS";
    return {
      total: n,
      rows: rows.map(r => ({
        key: `${trainers ? "trainer" : "manager"}:${r.pid}`,
        recipientType: trainers ? "TRAINER" as const : "MANAGER" as const,
        participantId: null, name: r.name, ic: r.ic,
        contingentId: r.contingent_id, contingentName: r.contingent_name, schoolName: r.school_name, stateName: r.state_name,
        countryName: r.country_name,
        teamId: null, teamName: null, competitionId: null, competitionName: null, competitionCode: null,
        eventId: null, eventName: cfg.eventNameOverride?.trim() || null, awardTitle: null, rank: null,
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

/** The snapshot fields a recipient contributes to its certificate row. */
function snapshotOf(r: Recipient) {
  return {
    recipientName: r.name, recipientType: r.recipientType ?? (r.participantId ? "PARTICIPANT" as const : "OTHER" as const), recipientIc: r.ic,
    contingentName: r.contingentName, schoolName: r.schoolName, stateName: r.stateName, countryName: r.countryName ?? null,
    teamName: r.teamName,
    competitionName: r.competitionName, competitionCode: r.competitionCode, eventName: r.eventName,
    awardTitle: r.awardTitle, rank: r.rank,
    participantId: r.participantId, contingentId: r.contingentId, teamId: r.teamId,
    eventId: r.eventId, competitionId: r.competitionId,
  };
}

/**
 * Issue one batch: certificates for `rows` against the template's current
 * version, skipping recipients already issued for this template — or, with
 * `refresh`, rewriting those certificates' snapshot from the current data
 * (serial number, verification code, issue date and version unchanged).
 */
export async function issueBatch(opts: {
  jobId: string; templateId: string; rows: Recipient[]; createdBy: string; refresh?: boolean;
  distributionLevel?: DistributionLevel;
}): Promise<{ created: number; skipped: number; updated: number }> {
  const distLevel = opts.distributionLevel ?? "NONE";
  const template = await db.certTemplate.findUnique({
    where: { id: opts.templateId },
    include: { season: { select: { id: true, serialPrefix: true, archivedAt: true } } },
  });
  if (!template) throw new Error("Templat tidak dijumpai.");
  if (!template.currentVersionId) throw new Error("Templat belum diterbitkan (publish) — tiada versi untuk dijana.");
  if (template.season.archivedAt) throw new Error("Musim templat ini telah diarkibkan.");

  const genKeys = opts.rows.map(r => `${template.id}:${r.key}`);
  const existing = genKeys.length ? await db.$queryRaw<{ k: string; id: string; status: string }[]>`
    SELECT meta->>'genKey' AS k, id, status::text AS status FROM certificates WHERE meta->>'genKey' = ANY(${genKeys})` : [];
  const done = new Map(existing.map(e => [e.k, e]));
  const todo = opts.rows.filter((_, i) => !done.has(genKeys[i]));
  const toRefresh = opts.refresh
    ? opts.rows.flatMap((r, i) => {
        const e = done.get(genKeys[i]);
        return e && e.status !== "REVOKED" ? [{ id: e.id, r }] : []; // revoked certificates stay as they were
      })
    : [];
  const now = new Date();
  // Online events (scope ONLINE_*) are flagged on the certificate itself, so the
  // portals can mark them without depending on the event row later.
  const eventIds = [...new Set(opts.rows.map(r => r.eventId).filter((x): x is string => !!x))];
  const onlineEvents = new Set((await db.event.findMany({
    where: { id: { in: eventIds } }, select: { id: true, scope: true },
  })).filter(e => String(e.scope).startsWith("ONLINE")).map(e => e.id));
  const metaOf = (r: Recipient) => ({
    genKey: `${template.id}:${r.key}`, jobId: opts.jobId, distLevel,
    online: !!r.eventId && onlineEvents.has(r.eventId),
  }) as Prisma.InputJsonValue;

  await db.$transaction(async (tx) => {
    for (const r of todo) {
      const serialNumber = await allocateSerial(tx, template.season, template.targetType as CertTargetType);
      await tx.certificate.create({
        data: {
          seasonId: template.seasonId, templateVersionId: template.currentVersionId!,
          serialNumber, uniqueCode: newUniqueCode(), status: "READY", issuedAt: now,
          ...snapshotOf(r),
          meta: metaOf(r),
          createdBy: opts.createdBy,
        },
      });
    }
    for (const { id, r } of toRefresh)
      await tx.certificate.update({
        where: { id },
        data: { ...snapshotOf(r), meta: metaOf(r) },
      });
  }, { timeout: 120_000 });

  return {
    created: todo.length, updated: toRefresh.length,
    skipped: opts.rows.length - todo.length - toRefresh.length,
  };
}
