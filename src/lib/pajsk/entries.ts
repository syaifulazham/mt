/**
 * PAJSK entries — derived only from issued certificates (decided with the user):
 * a participant's READY certificates of the current season, grouped by
 * competition code, give one PAJSK entry each.
 *
 *   stage    — highest stage among those certificates: the stage the rules give
 *              the certificate's event (eventStages), else its distribution
 *              level (distLevelStages); certificates with neither are ignored
 *   placing  — best rank on any of them (winner certificates), shown up to
 *              rules.placesShown; ties prefer the higher stage
 *   marks    — Pelibatan for every entry, Pencapaian by place, from the rules
 *
 * Nothing reads operational tables (teams, events, results): only certificate
 * rows and their season, as the archival contract requires. Each entry is
 * stored in `pajsk_certificates` with a stable 10-character code; the snapshot
 * is refreshed when the source certificates change, and an entry that can no
 * longer be derived is WITHDRAWN (its code then fails verification).
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { newPajskCode } from "./code";
import {
  STAGE_ORDER, getPajskRules, medalFor, pencapaianMarks, type PajskRules, type Stage,
} from "./rules";

export type PajskSeason = { id: string; year: number; name: string; rules: PajskRules };

/** The current, non-archived season — if it has PAJSK rules. */
export async function getPajskSeason(): Promise<PajskSeason | null> {
  const season = await db.season.findFirst({ where: { isCurrent: true, archivedAt: null }, select: { id: true, year: true, name: true } });
  if (!season) return null;
  const rules = await getPajskRules(season.year);
  return rules ? { ...season, rules } : null;
}

// Certificate kinds that say "this participant took part in / placed in a competition".
const SOURCE_TYPES = ["EVENT_PARTICIPANT", "EVENT_WINNER", "QUIZ_PARTICIPANT", "QUIZ_WINNER", "SCHOOL_WINNER", "GENERAL"];

type SourceRow = {
  id: string; participantId: string; recipientName: string; schoolName: string | null; contingentName: string | null;
  stateName: string | null; competitionCode: string; competitionName: string | null; rank: number | null;
  distLevel: string | null; eventId: string | null;
};

export type DerivedEntry = {
  participantId: string; competitionCode: string; competitionName: string | null;
  recipientName: string; schoolName: string | null; stateName: string | null;
  stage: Stage; placing: number | null; placingStage: Stage | null;
  pelibatanMarks: number; pencapaianMarks: number | null; sourceCertIds: string[];
};

export function certStage(rules: PajskRules, eventId: string | null, distLevel: string | null): Stage | null {
  return (eventId ? rules.eventStages[eventId] : undefined) ?? (distLevel ? rules.distLevelStages[distLevel] ?? null : null);
}

/** Derives the entries of the given participants from their certificates. */
export async function deriveEntries(season: PajskSeason, participantIds: string[]): Promise<DerivedEntry[]> {
  if (!participantIds.length) return [];
  const rows = await db.$queryRaw<SourceRow[]>`
    SELECT c.id, c."participantId", c."recipientName", c."schoolName", c."contingentName", c."stateName",
           upper(trim(c."competitionCode")) AS "competitionCode", c."competitionName", c.rank,
           c.meta->>'distLevel' AS "distLevel", c."eventId"
    FROM certificates c
    JOIN cert_template_versions v ON v.id = c."templateVersionId"
    JOIN cert_templates t          ON t.id = v."templateId"
    WHERE c."seasonId" = ${season.id}
      AND c.status = 'READY'
      AND c."recipientType" = 'PARTICIPANT'
      AND c."participantId" IN (${Prisma.join(participantIds)})
      AND COALESCE(trim(c."competitionCode"), '') <> ''
      AND t."targetType"::text IN (${Prisma.join(SOURCE_TYPES)})
    ORDER BY c."createdAt"`;

  const { rules } = season;
  const groups = new Map<string, { row: SourceRow; stage: Stage }[]>();
  for (const r of rows) {
    const stage = certStage(rules, r.eventId, r.distLevel);
    if (!stage) continue;
    const key = `${r.participantId}\u0000${r.competitionCode}`;
    groups.set(key, [...(groups.get(key) ?? []), { row: r, stage }]);
  }

  const out: DerivedEntry[] = [];
  for (const list of groups.values()) {
    // Highest stage; within it, the latest certificate carries the name / school snapshot.
    const top = list.reduce((a, b) => (STAGE_ORDER[b.stage] >= STAGE_ORDER[a.stage] ? b : a));
    let best: { place: number; stage: Stage } | null = null;
    for (const { row, stage } of list) {
      const place = row.rank;
      if (place == null || place < 1 || place > rules.placesShown) continue;
      if (!best || place < best.place || (place === best.place && STAGE_ORDER[stage] > STAGE_ORDER[best.stage]))
        best = { place, stage };
    }
    const r = top.row;
    out.push({
      participantId: r.participantId, competitionCode: r.competitionCode,
      competitionName: list.find(x => x.stage === top.stage && x.row.competitionName)?.row.competitionName ?? r.competitionName,
      recipientName: r.recipientName.trim(), schoolName: r.schoolName || r.contingentName, stateName: r.stateName,
      stage: top.stage, placing: best?.place ?? null, placingStage: best?.stage ?? null,
      pelibatanMarks: rules.pelibatan.marks, pencapaianMarks: pencapaianMarks(rules, best?.place ?? null),
      sourceCertIds: list.map(x => x.row.id).sort(),
    });
  }
  return out.sort((a, b) => a.participantId.localeCompare(b.participantId) || a.competitionCode.localeCompare(b.competitionCode, undefined, { numeric: true }));
}

export type PajskEntry = DerivedEntry & {
  id: string; code: string; stageLabel: string; colour: string; medal: string | null; placingStageLabel: string | null;
};

const SNAPSHOT_FIELDS = [
  "competitionName", "recipientName", "schoolName", "stateName", "stage", "placing", "placingStage",
  "pelibatanMarks", "pencapaianMarks",
] as const;

function sameSnapshot(row: Record<string, unknown>, d: DerivedEntry, rulesYear: number): boolean {
  if (row.status !== "VALID" || row.rulesYear !== rulesYear) return false;
  if (SNAPSHOT_FIELDS.some(f => (row[f] ?? null) !== (d[f] ?? null))) return false;
  return JSON.stringify(row.sourceCertIds) === JSON.stringify(d.sourceCertIds);
}

/**
 * Derives the participants' entries and brings `pajsk_certificates` in line:
 * new entries get a code, changed ones a refreshed snapshot (same code), and
 * rows no longer derivable are WITHDRAWN. Returns the VALID entries.
 */
export async function syncEntries(season: PajskSeason, participantIds: string[]): Promise<PajskEntry[]> {
  if (!participantIds.length) return [];
  const [derived, existing] = await Promise.all([
    deriveEntries(season, participantIds),
    db.pajskCertificate.findMany({ where: { seasonId: season.id, participantId: { in: participantIds } } }),
  ]);
  const byKey = new Map(existing.map(r => [`${r.participantId}\u0000${r.competitionCode}`, r]));
  const rulesYear = season.rules.year;
  const out: PajskEntry[] = [];

  for (const d of derived) {
    const key = `${d.participantId}\u0000${d.competitionCode}`;
    let row = byKey.get(key);
    byKey.delete(key);
    const data = {
      competitionName: d.competitionName, recipientName: d.recipientName, schoolName: d.schoolName, stateName: d.stateName,
      stage: d.stage, placing: d.placing, placingStage: d.placingStage, pelibatanMarks: d.pelibatanMarks,
      pencapaianMarks: d.pencapaianMarks, rulesYear, sourceCertIds: d.sourceCertIds, status: "VALID",
    };
    if (!row) {
      row = await createWithCode({ seasonId: season.id, participantId: d.participantId, competitionCode: d.competitionCode, ...data });
    } else if (!sameSnapshot(row as unknown as Record<string, unknown>, d, rulesYear)) {
      row = await db.pajskCertificate.update({ where: { id: row.id }, data });
    }
    out.push(present(season.rules, d, row.id, row.code));
  }

  const gone = [...byKey.values()].filter(r => r.status === "VALID").map(r => r.id);
  if (gone.length) await db.pajskCertificate.updateMany({ where: { id: { in: gone } }, data: { status: "WITHDRAWN" } });
  return out;
}

async function createWithCode(data: Omit<Prisma.PajskCertificateUncheckedCreateInput, "code">) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.pajskCertificate.create({ data: { ...data, code: newPajskCode() } });
    } catch (e) {
      // A code collision (1 in 2^50 per pair) — or a concurrent first view of the same entry.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002" || attempt >= 4) throw e;
      const raced = await db.pajskCertificate.findUnique({
        where: { seasonId_participantId_competitionCode: { seasonId: data.seasonId, participantId: data.participantId, competitionCode: data.competitionCode } },
      });
      if (raced) return raced;
    }
  }
}

export function present(rules: PajskRules, d: DerivedEntry, id: string, code: string): PajskEntry {
  return {
    ...d, id, code,
    stageLabel: rules.stages[d.stage].label, colour: rules.stages[d.stage].colour,
    medal: medalFor(rules, d.placing),
    placingStageLabel: d.placingStage ? rules.stages[d.placingStage].label : null,
  };
}

/** A stored row as an entry (PDF / verification), using the rules of its year. */
export function rowToEntry(rules: PajskRules, row: {
  id: string; code: string; participantId: string; competitionCode: string; competitionName: string | null;
  recipientName: string; schoolName: string | null; stateName: string | null; stage: string; placing: number | null;
  placingStage: string | null; pelibatanMarks: number; pencapaianMarks: number | null; sourceCertIds: string[];
}): PajskEntry {
  return present(rules, {
    participantId: row.participantId, competitionCode: row.competitionCode, competitionName: row.competitionName,
    recipientName: row.recipientName, schoolName: row.schoolName, stateName: row.stateName,
    stage: row.stage as Stage, placing: row.placing, placingStage: row.placingStage as Stage | null,
    pelibatanMarks: row.pelibatanMarks, pencapaianMarks: row.pencapaianMarks, sourceCertIds: row.sourceCertIds,
  }, row.id, row.code);
}

/**
 * Re-derives one stored row (verification, PDF) so a code reflects the
 * current certificates: refreshed, or withdrawn if no longer derivable.
 */
export async function refreshRow(id: string) {
  const row = await db.pajskCertificate.findUnique({ where: { id }, include: { season: true } });
  if (!row) return null;
  const rules = await getPajskRules(row.rulesYear);
  if (!rules) return { row, rules: null };
  if (!row.season.archivedAt && row.season.isCurrent) {
    await syncEntries({ id: row.seasonId, year: row.season.year, name: row.season.name, rules }, [row.participantId]);
    const fresh = await db.pajskCertificate.findUnique({ where: { id }, include: { season: true } });
    return { row: fresh!, rules };
  }
  return { row, rules };
}
