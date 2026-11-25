/**
 * Read-only: walk-in winner certificates whose printed rank differs from the
 * walk-in's national (Kebangsaan) rank. Walk-ins are always ranked nationally;
 * generators run "by state" used to rank them per negeri.
 *
 *   npx tsx prisma/check-walkin-cert-ranks.ts            # summary + mismatches
 *   npx tsx prisma/check-walkin-cert-ranks.ts --csv      # mismatches as CSV
 *
 * Writes nothing. Remediation (revoke + re-issue) is a separate, approved step.
 */
import { db } from "@/lib/db";
import { computeCompetitionResults, type CompetitionResult } from "@/lib/resultsRankings";

const csv = process.argv.includes("--csv");

async function main() {
  // Pencapaian Acara keys: <templateId>:win:walk:<event>:<code>:<participant>,
  // ...:wintr:walk:<event>:<code>:<registration>:trainer:<id>, ...:winsch:walk:<event>:<code>:<registration>:<contingent>
  const certs = await db.$queryRawUnsafe<{
    id: string; serialNumber: string; status: string; recipientName: string; stateName: string | null;
    competitionCode: string | null; eventId: string | null; eventName: string | null;
    participantId: string | null; rank: number | null; awardTitle: string | null; genKey: string;
  }[]>(`
    SELECT id, "serialNumber", status::text, "recipientName", "stateName", "competitionCode", "eventId", "eventName",
           "participantId", rank, "awardTitle", meta->>'genKey' AS "genKey"
    FROM certificates
    WHERE meta->>'genKey' ~ ':win(tr|sch)?:walk:' AND status::text <> 'REVOKED'
    ORDER BY "eventName", "competitionCode", rank, "serialNumber"`);

  const cache = new Map<string, CompetitionResult[]>();
  const resultsOf = async (eventId: string) => {
    if (!cache.has(eventId)) cache.set(eventId, await computeCompetitionResults(eventId, true, null));
    return cache.get(eventId)!;
  };

  const mismatches: (typeof certs[number] & { nationalRank: number | null; nationalScore: number | null })[] = [];
  for (const c of certs) {
    const m = c.genKey.match(/:(win|wintr|winsch):walk:([^:]+):([^:]+):([^:]+)/);
    if (!m) continue;
    const [, kind, eventId, code, who] = m;
    const r = (await resultsOf(eventId)).find(x => x.code === code);
    const entries = [...(r?.rankings ?? []), ...(r?.foreignRankings ?? [])];
    const e = kind === "win"
      ? entries.find(x => x.members.some(mm => mm.id === (c.participantId ?? who)))
      : entries.find(x => x.teamId === who);
    const nationalRank = e && r?.rankings.includes(e) ? e.rank : null;
    if (nationalRank !== c.rank) mismatches.push({ ...c, nationalRank, nationalScore: e?.totalScore ?? null });
  }

  if (csv) {
    console.log("serial,recipient,state,event,competition,printedRank,nationalRank,score,status");
    for (const x of mismatches)
      console.log([x.serialNumber, x.recipientName, x.stateName, x.eventName, x.competitionCode, x.rank, x.nationalRank, x.nationalScore, x.status]
        .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    return;
  }
  console.log(`walk-in winner certificates (not revoked): ${certs.length}`);
  console.log(`printed rank ≠ national rank: ${mismatches.length}`);
  const byEvent = new Map<string, number>();
  for (const x of mismatches) byEvent.set(x.eventName ?? x.eventId ?? "-", (byEvent.get(x.eventName ?? x.eventId ?? "-") ?? 0) + 1);
  for (const [ev, n] of byEvent) console.log(`  ${ev}: ${n}`);
  for (const x of mismatches.slice(0, 50))
    console.log(`  ${x.serialNumber}  ${x.competitionCode}  ${x.stateName ?? "-"}  printed ${x.rank} → national ${x.nationalRank ?? "none"}  ${x.recipientName}`);
}

main().finally(() => db.$disconnect());
