import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { ScoreRankingClient } from "@/components/organizer/scoreboard/ScoreRankingClient";
import { DuelManageClient } from "@/components/organizer/scoreboard/DuelManageClient";

export const metadata: Metadata = { title: "Scoreboard" };

// One competition on the Scoreboard: the duel manager for Duel competitions,
// a live ranking for score-judged ones.
export default async function ScoreboardCompetitionPage({ params }: { params: Promise<{ slug: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug, ecId } = await params;

  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, event: { slug } },
    select: {
      id: true, judgingMethod: true,
      event: { select: { id: true, name: true, slug: true } },
      competition: { select: { name: true, code: true } },
    },
  });
  if (!ec) redirect(`/organizer/events/${slug}/manage/scoreboard`);

  const props = { event: ec.event, ecId: ec.id, competition: ec.competition };
  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {ec.judgingMethod === "DUEL"
        ? <DuelManageClient {...props} role={session.role} />
        : <ScoreRankingClient {...props} />}
    </OrganizerShell>
  );
}
