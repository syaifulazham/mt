import { db } from "@/lib/db";
import { resolveResultScope } from "@/lib/resultScope";

// Merged state teams (TeamMerge): with EventCompetition.mergeByState on and
// national results, several registered teams of one state compete as one
// ("JOHOR A"). The merge's first team is its lead: duel entries and judging
// scores carry the lead's id, and every list of competitors shows the merge in
// place of its teams. Pure helpers (auto-merge, names): team-merge.ts.

export type MergeRow = { id: string; name: string; stateId: string | null; position: number; teamIds: string[] };

const MERGE_SELECT = { id: true, name: true, stateId: true, position: true, teamIds: true } as const;

type EcMergeFields = { mergeByState: boolean; resultScope: string | null; judgingMethod: string; duelConfig: unknown };

/** Merging applies: switched on, and results ranked nationally (per-state ranking would pit a state against itself). */
export function mergeApplies(ec: EcMergeFields, eventScope: string): boolean {
  return ec.mergeByState && resolveResultScope(ec, eventScope) !== "STATE";
}

const EC_SELECT = {
  id: true, mergeByState: true, resultScope: true, judgingMethod: true, duelConfig: true,
  event: { select: { scope: true } },
} as const;

/** The competition's merges when merging applies, else null. */
export async function activeMerges(ecId: string): Promise<MergeRow[] | null> {
  return (await mergesByEc([ecId])).get(ecId) ?? null;
}

/** Merges of each competition where merging applies (others are absent). */
export async function mergesByEc(ecIds: string[]): Promise<Map<string, MergeRow[]>> {
  const out = new Map<string, MergeRow[]>();
  if (!ecIds.length) return out;
  const ecs = await db.eventCompetition.findMany({ where: { id: { in: ecIds }, mergeByState: true }, select: EC_SELECT });
  const on = ecs.filter(ec => mergeApplies(ec, String(ec.event.scope))).map(ec => ec.id);
  if (!on.length) return out;
  const rows = await db.teamMerge.findMany({
    where: { eventCompetitionId: { in: on } }, orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { ...MERGE_SELECT, eventCompetitionId: true },
  });
  for (const id of on) out.set(id, []);
  for (const { eventCompetitionId, ...m } of rows) out.get(eventCompetitionId)!.push(m);
  return out;
}

/** Teams that compete inside a merge under its lead's id (every member but the lead). */
export function hiddenMembers(merges: MergeRow[] | null | undefined): Set<string> {
  return new Set((merges ?? []).flatMap(m => m.teamIds.slice(1)));
}

/** Merge led by each lead team id. */
export function mergeByLead(merges: MergeRow[] | null | undefined): Map<string, MergeRow> {
  return new Map((merges ?? []).filter(m => m.teamIds.length).map(m => [m.teamIds[0], m]));
}

/**
 * Why the merges can no longer change, or null: a duel round is confirmed, or a
 * judging score is recorded (scores and entries carry the lead teams' ids).
 */
export async function mergeLockReason(ecId: string): Promise<string | null> {
  const [rounds, scores] = await Promise.all([
    db.duelRound.count({ where: { eventCompetitionId: ecId, status: { not: "DRAFT" } } }),
    db.judgingScore.count({ where: { judgingTask: { eventCompetitionId: ecId } } }),
  ]);
  if (rounds) return "Cabutan duel sudah disahkan — gabungan tidak boleh diubah.";
  if (scores) return "Penghakiman sudah bermula (markah direkodkan) — gabungan tidak boleh diubah.";
  return null;
}
