import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { WalkInResultsClient } from "@/components/organizer/events/WalkInResultsClient";
import { walkInJudgingProgress, type JudgingRow } from "@/lib/judgingStatus";
import { computeCompetitionResults, type RankingEntry } from "@/lib/resultsRankings";

type WalkInRankEntry = {
  registrationId: string; participantName: string;
  contingentName: string; contingentLogo: string | null;
  totalScore: number; bestTime: number | null; rank: number;
};

export const metadata: Metadata = { title: "Keputusan Walk-in" };

export default async function WalkInResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true,
      walkInCompetitions: {
        select: {
          id: true,
          judgingStatus: true, judgingVerifiedAt: true, judgingVerifiedBy: true,
          competition: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      resultsEndpoints: {
        where: { isWalkIn: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  type Judging = { status: string; verifiedAt: string | null; verifiedBy: string | null; statusUrl: string; rows: JudgingRow[] };
  // Per-state judging rows ("Semua" + states with participants) for the verification table.
  const progress = new Map((await walkInJudgingProgress(event.id)).map((p) => [p.id, p.rows]));
  // The same rankings the certificate generator (Pencapaian Acara) issues from,
  // so the ranks shown here are the ranks printed on walk-in certificates.
  const results = new Map((await computeCompetitionResults(event.id, true, null)).map(r => [r.id, r]));

  const toEntry = (e: RankingEntry): WalkInRankEntry => ({
    registrationId: e.teamId, participantName: e.teamName,
    contingentName: e.contingentName, contingentLogo: e.contingentLogo,
    totalScore: e.totalScore, bestTime: e.bestTime, rank: e.rank,
  });

  const competitionRankings = event.walkInCompetitions.map((wc) => {
    const judging: Judging = {
      status:     wc.judgingStatus,
      verifiedAt: wc.judgingVerifiedAt?.toISOString() ?? null,
      verifiedBy: wc.judgingVerifiedBy,
      statusUrl:  `/api/v2/organizer/events/${event.id}/walkin/${wc.id}/judging-status`,
      rows:       progress.get(wc.id) ?? [],
    };
    const r = results.get(wc.id);
    return {
      id: wc.id, name: wc.competition.name, code: wc.competition.code, judging,
      // Walk-ins are always ranked nationally (Kebangsaan) — one list, as certificates rank them.
      rankings: (r?.rankings ?? []).map(toEntry),
      // Foreign walk-ins: ranked within their own country, never with the locals.
      foreign: (r?.foreignRankings ?? []).map(e => ({ ...toEntry(e), countryName: e.countryName ?? "" })),
    };
  });

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WalkInResultsClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitionRankings={competitionRankings}
        endpoints={event.resultsEndpoints.map(ep => ({ ...ep, createdAt: ep.createdAt.toISOString() }))}
        canWrite={["SUPER_ADMIN", "ADMIN", "OPERATOR"].includes(session.role)}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
      />
    </OrganizerShell>
  );
}
