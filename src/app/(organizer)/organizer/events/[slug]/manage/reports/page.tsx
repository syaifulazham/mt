import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventReportsClient } from "@/components/organizer/events/EventReportsClient";

export const metadata: Metadata = { title: "Laporan" };

export type CompetitionEntry = {
  id: string; name: string; code: string; schoolLevels: string[];
};

export default async function EventReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      eventCompetitions: {
        select: {
          competition: {
            select: {
              id: true, name: true, code: true,
              targetGroups: {
                select: { targetGroup: { select: { schoolLevel: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  const competitions: CompetitionEntry[] = event.eventCompetitions
    .map(ec => ({
      id:           ec.competition.id,
      name:         ec.competition.name,
      code:         ec.competition.code,
      schoolLevels: ec.competition.targetGroups.map(tg => tg.targetGroup.schoolLevel),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventReportsClient
        eventId={event.id}
        eventName={event.name}
        slug={event.slug}
        competitions={competitions}
      />
    </OrganizerShell>
  );
}
