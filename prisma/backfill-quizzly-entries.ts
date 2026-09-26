/**
 * Backfill: enter every participant who already holds an Asia Spark Quizzly
 * token into that competition for that event.
 *
 * Token requests started registering the participant (a team of one + a
 * TeamEvent) only from the change that introduced this script; tokens issued
 * before it left the participant off the event's preregistration list.
 *
 * Run:  npx tsx prisma/backfill-quizzly-entries.ts [--dry-run]
 *
 * Idempotent — ensureIndividualEntry reuses existing teams and TeamEvents.
 */

import { PrismaClient } from "@prisma/client";
import { ensureIndividualEntry, singleParticipationConflict } from "../src/lib/individualEntry";

const db = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const tokens = await db.participantQuizzlyToken.findMany({
    select: {
      eventCompetitionId: true,
      participant: { select: { id: true, name: true, contingentId: true } },
    },
  });

  const ecs = await db.eventCompetition.findMany({
    where:  { id: { in: [...new Set(tokens.map((t) => t.eventCompetitionId))] } },
    select: {
      id: true, eventId: true, competitionId: true,
      event:       { select: { name: true } },
      competition: { select: { code: true, participationType: true } },
    },
  });
  const ecById = new Map(ecs.map((ec) => [ec.id, ec]));

  let createdTeams = 0, createdEntries = 0, alreadyEntered = 0, skipped = 0, blocked = 0;

  for (const t of tokens) {
    const ec = ecById.get(t.eventCompetitionId);
    if (!ec || ec.competition.participationType !== "INDIVIDUAL") { skipped++; continue; }

    // Honour the event's "Penyertaan" rule, same as the token route.
    const conflict = await singleParticipationConflict(db, {
      participantId: t.participant.id, eventId: ec.eventId, exceptCompetitionId: ec.competitionId,
    });
    if (conflict) {
      blocked++;
      console.log(`  BLOCK ${ec.competition.code} @ ${ec.event.name} — ${t.participant.name} (already in ${conflict}; event is single-participation)`);
      continue;
    }

    if (DRY_RUN) {
      const entered = await db.teamEvent.findFirst({
        where: {
          eventId: ec.eventId,
          team: { competitionId: ec.competitionId, members: { some: { participantId: t.participant.id } } },
        },
        select: { id: true },
      });
      if (entered) alreadyEntered++; else createdEntries++;
      console.log(`${entered ? "  ok " : "  ADD"} ${ec.competition.code} @ ${ec.event.name} — ${t.participant.name}`);
      continue;
    }

    const r = await db.$transaction((tx) =>
      ensureIndividualEntry(tx, { participant: t.participant, competitionId: ec.competitionId, eventId: ec.eventId }),
    );
    if (r.createdTeam) createdTeams++;
    if (r.createdTeamEvent) createdEntries++; else alreadyEntered++;
    console.log(`${r.createdTeamEvent ? "  ADD" : "  ok "} ${ec.competition.code} @ ${ec.event.name} — ${t.participant.name}`);
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] " : ""}tokens ${tokens.length} | entries ${DRY_RUN ? "to add" : "added"} ${createdEntries}` +
    `${DRY_RUN ? "" : ` (new teams ${createdTeams})`} | already entered ${alreadyEntered} | skipped ${skipped}` +
    ` | blocked by single participation ${blocked}`,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
