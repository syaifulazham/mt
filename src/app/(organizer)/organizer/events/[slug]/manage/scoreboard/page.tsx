import type { Metadata } from "next";
import { competitionTitle } from "@/lib/competition-split";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { eventJudgingProgress } from "@/lib/judgingStatus";
import { duelPhase, loadRounds } from "@/lib/duel-server";
import { ScoreboardClient } from "@/components/organizer/scoreboard/ScoreboardClient";

export const metadata: Metadata = { title: "Scoreboard" };

export default async function ScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      eventCompetitions: {
        select: {
          id: true, judgingMethod: true, judgingStatus: true,
          competition: { select: { name: true, code: true, participationType: true } },
          splitLabel: true,
          _count: { select: { judgingTasks: true } },
        },
      },
    },
  });
  if (!event) redirect("/organizer/events");

  const progress = new Map((await eventJudgingProgress(event.id)).map(p => [p.id, p]));
  const cards = await Promise.all(event.eventCompetitions.map(async ec => ({
    id: ec.id,
    code: ec.competition.code,
    name: competitionTitle(ec.competition.name, ec.splitLabel),
    participationType: ec.competition.participationType,
    method: ec.judgingMethod,
    judgingStatus: ec.judgingStatus,
    tasks: ec._count.judgingTasks,
    teamCount: progress.get(ec.id)?.teamCount ?? 0,
    phase: ec.judgingMethod === "DUEL" ? duelPhase(await loadRounds(ec.id)) : null,
  })));
  cards.sort((a, b) => Number(b.method === "DUEL") - Number(a.method === "DUEL") || a.code.localeCompare(b.code, undefined, { numeric: true }));

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ScoreboardClient
        event={{ id: event.id, name: event.name, slug: event.slug }}
        cards={cards}
        canManageDisplays={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
      />
    </OrganizerShell>
  );
}
