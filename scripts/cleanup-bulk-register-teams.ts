import { db } from "../src/lib/db";

// Cleanup for teams wrongly created by the bulk-register job (pre-df03b71).
//
// Identification criteria (all must hold):
//   - team has exactly ONE member, and a registration_stats row exists for
//     the same (competitionId, participantId)
//   - team name == participant name
//   - team createdAt is within 60s BEFORE the matching stats row
//     (the old job created the team first, then the stat)
//   - team has no team_events / judging_scores / trainers / drone access
//
// Usage:
//   DATABASE_URL="postgresql://...prod..." npx tsx scripts/cleanup-bulk-register-teams.ts           # dry-run (default)
//   DATABASE_URL="postgresql://...prod..." npx tsx scripts/cleanup-bulk-register-teams.ts --commit  # actually delete

const COMMIT = process.argv.includes("--commit");

const IDS_SQL = `
  SELECT t.id AS team_id, c.code AS comp, t."createdAt" AS team_created, rs."createdAt" AS stat_created
  FROM   teams t
  JOIN   team_members tm ON tm."teamId" = t.id
  JOIN   contestants  p  ON p.id = tm."contestantId"
  JOIN   competitions c  ON c.id = t."competitionId"
  JOIN   registration_stats rs
         ON rs."competitionId" = t."competitionId"
        AND rs."contestantId"  = tm."contestantId"
  WHERE  (SELECT COUNT(*) FROM team_members x WHERE x."teamId" = t.id) = 1
    AND  t.name = p.name
    AND  t."createdAt" <= rs."createdAt"
    AND  rs."createdAt" <  t."createdAt" + interval '60 seconds'
    AND  NOT EXISTS (SELECT 1 FROM team_events      te WHERE te."teamId" = t.id)
    AND  NOT EXISTS (SELECT 1 FROM judging_scores   js WHERE js."teamId" = t.id)
    AND  NOT EXISTS (SELECT 1 FROM team_trainers    tt WHERE tt."teamId" = t.id)
    AND  NOT EXISTS (SELECT 1 FROM team_drone_access td WHERE td."teamId" = t.id)
`;

async function main() {
  const rows = await db.$queryRawUnsafe<{ team_id: string; comp: string; team_created: Date; stat_created: Date }[]>(IDS_SQL);
  const ids = rows.map(r => r.team_id);

  const byComp = new Map<string, number>();
  for (const r of rows) byComp.set(r.comp, (byComp.get(r.comp) ?? 0) + 1);
  console.log("candidate job-created teams:", ids.length);
  console.log("per competition:", Object.fromEntries([...byComp.entries()].sort((a, b) => b[1] - a[1])));
  console.log("registration_stats rows (kept):", await db.registrationStat.count());
  for (const r of rows.slice(0, 3)) console.log("sample:", r);

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes made. Re-run with --commit to delete.");
    process.exit(0);
  }

  const CHUNK = 2000;
  let delMembers = 0, delTeams = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    delMembers += (await db.teamMember.deleteMany({ where: { teamId: { in: chunk } } })).count;
    delTeams += (await db.team.deleteMany({ where: { id: { in: chunk } } })).count;
    if ((i / CHUNK) % 5 === 0) console.log(`progress: ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
  }
  console.log("deleted team_members:", delMembers, "| teams:", delTeams);
  process.exit(0);
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
