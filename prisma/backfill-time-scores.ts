/**
 * Fill in the points of recorded TIME scores (judging and walk-in judging).
 *
 * Until 2026-11-12 a TIME criterion's time was stored but never turned into
 * points, although the template promised "maxScore at 0 s down to 0 at
 * maxTime". New saves compute it (src/lib/judgingTime.ts `timeScore`); this
 * recomputes every recorded TIME row from its time and its criterion's current
 * maxScore / maxTime. Re-runnable; criteria without maxScore or maxTime (time
 * as a tie-break only, e.g. CSI "Masa Rasmi") are left as they are.
 *
 *   npx tsx prisma/backfill-time-scores.ts --dry-run   # report only
 *   npx tsx prisma/backfill-time-scores.ts             # write
 */
import { PrismaClient } from "@prisma/client";
import { timeScore } from "../src/lib/judgingTime";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const where = { timeSeconds: { not: null }, criterion: { type: "TIME" as const, maxScore: { not: null }, maxTime: { not: null } } };
  const select = { id: true, score: true, timeSeconds: true, criterion: { select: { maxScore: true, maxTime: true } } } as const;
  const [event, walkin] = await Promise.all([
    db.judgingScore.findMany({ where, select }),
    db.walkInJudgingScore.findMany({ where, select }),
  ]);
  for (const [label, rows, update] of [
    ["judging_scores", event, (id: string, score: number | null) => db.judgingScore.update({ where: { id }, data: { score } })],
    ["walkin_judging_scores", walkin, (id: string, score: number | null) => db.walkInJudgingScore.update({ where: { id }, data: { score } })],
  ] as const) {
    const changes = rows.map(r => ({ id: r.id, from: r.score, to: timeScore(r.criterion, r.timeSeconds) })).filter(c => c.from !== c.to);
    console.log(`${label}: ${rows.length} TIME rows with a scored criterion, ${changes.length} to update`);
    for (const c of changes.slice(0, 5)) console.log(`  ${c.id}: ${c.from ?? "null"} → ${c.to ?? "null"}`);
    if (!dryRun) for (const c of changes) await update(c.id, c.to);
  }
  console.log(dryRun ? "dry run — nothing written" : "done");
}

main().finally(() => db.$disconnect());
