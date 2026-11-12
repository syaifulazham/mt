// Merged state teams — pure helpers shared by the server and the merge editor.
// Server side (which merges apply, overlays on judging and results): team-merge-server.ts.

export type MergeTeam = { id: string; stateId: string | null; stateName: string | null; contingentId: string };
export type MergeGroup = { name: string; stateId: string | null; teamIds: string[] };

/** "A", "B", … "Z", "AA", … */
export function mergeSuffix(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A state's merged-team names: "JOHOR" alone, else "JOHOR A", "JOHOR B", … */
export function mergeNames(stateName: string, count: number): string[] {
  const base = stateName.trim().toUpperCase();
  return count <= 1 ? [base] : Array.from({ length: count }, (_, i) => `${base} ${mergeSuffix(i)}`);
}

/**
 * Automatic merge: each state's teams in as few groups of at most `max` as
 * possible, sizes even (7 teams, max 3 → 3,2,2). Teams of one contingent are
 * dealt across the groups. Teams without a state stay unmerged.
 */
export function autoMerge(teams: MergeTeam[], max: number): MergeGroup[] {
  const byState = new Map<string, MergeTeam[]>();
  for (const t of teams) if (t.stateId) byState.set(t.stateId, [...(byState.get(t.stateId) ?? []), t]);
  const out: MergeGroup[] = [];
  const states = [...byState.values()].sort((a, b) => (a[0].stateName ?? "").localeCompare(b[0].stateName ?? ""));
  for (const list of states) {
    const k = Math.ceil(list.length / Math.max(1, max));
    const names = mergeNames(list[0].stateName ?? "", k);
    const groups = names.map(name => ({ name, stateId: list[0].stateId, teamIds: [] as string[] }));
    const sorted = [...list].sort((a, b) => a.contingentId.localeCompare(b.contingentId));
    sorted.forEach((t, i) => groups[i % k].teamIds.push(t.id));
    out.push(...groups);
  }
  return out;
}
