import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { CompetitionsClient } from "@/components/participant/CompetitionsClient";
import { WalkInCompetitionsSection } from "@/components/participant/WalkInCompetitionsSection";

const droneEnabled = !!process.env.EPTIMDRONE_API_KEY;

export const metadata: Metadata = { title: "Pertandingan" };

export default async function CompetitionsPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { eduLevel: true, ppki: true },
  });
  if (!participant) redirect("/participant/sign-in");

  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    select: { team: { select: { competitionId: true } } },
  });
  const enrolledIds = new Set(memberships.map((m) => m.team.competitionId));

  const [competitions, walkInLinks] = await Promise.all([
    db.competition.findMany({
      where: {
        targetGroups: {
          some: {
            targetGroup: {
              schoolLevel: participant.eduLevel,
              ...(participant.ppki ? {} : { ppki: false }),
            },
          },
        },
      },
      include: {
        theme:        { select: { name: true, color: true } },
        targetGroups: { include: { targetGroup: { select: { ppki: true, schoolLevel: true } } } },
        docs:         { select: { id: true, name: true, url: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.eventWalkInCompetition.findMany({
      where: {
        publishToPortal: true,
        event: { status: { in: ["PUBLISHED", "ACTIVE"] } },
        competition: {
          targetGroups: {
            some: {
              targetGroup: {
                schoolLevel: participant.eduLevel,
                ...(participant.ppki ? {} : { ppki: false }),
              },
            },
          },
        },
      },
      select: {
        id: true,
        maxSlots: true,
        _count: { select: { registrations: true } },
        event: {
          select: { id: true, name: true, slug: true, venue: true, startDate: true, endDate: true },
        },
        competition: {
          select: { id: true, code: true, name: true, participationType: true },
        },
      },
      orderBy: [{ event: { startDate: "asc" } }, { competition: { code: "asc" } }],
    }),
  ]);

  const data = competitions.map(comp => ({
    id:                 comp.id,
    code:               comp.code,
    name:               comp.name,
    description:        comp.description,
    participationType:  comp.participationType,
    venue:              comp.venue,
    startDate:          comp.startDate?.toISOString() ?? null,
    endDate:            comp.endDate?.toISOString()   ?? null,
    eptimEduCourseTitle:    comp.eptimEduCourseTitle,
    thirdPartyIntegration:  droneEnabled ? (comp.thirdPartyIntegration ?? "none") : "none",
    hasPpki:                comp.targetGroups.some(tg => tg.targetGroup.ppki),
    enrolled:               enrolledIds.has(comp.id),
    theme:                  comp.theme,
    docs:                   comp.docs,
  }));

  const walkInData = walkInLinks.map(wic => ({
    id:              wic.id,
    maxSlots:        wic.maxSlots,
    registrations:   wic._count.registrations,
    event: {
      id:        wic.event.id,
      name:      wic.event.name,
      slug:      wic.event.slug,
      venue:     wic.event.venue,
      startDate: wic.event.startDate?.toISOString() ?? null,
      endDate:   wic.event.endDate?.toISOString()   ?? null,
    },
    competition: wic.competition,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold dark:text-zinc-100">Pertandingan</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Senarai pertandingan yang layak untuk anda sertai
          </p>
        </div>
        <CompetitionsClient competitions={data} />
      </div>

      {walkInData.length > 0 && (
        <WalkInCompetitionsSection walkInCompetitions={walkInData} />
      )}
    </div>
  );
}
