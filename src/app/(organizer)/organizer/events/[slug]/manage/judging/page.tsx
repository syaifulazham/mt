import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventJudgingClient } from "@/components/organizer/events/EventJudgingClient";

export const metadata: Metadata = { title: "Penghakiman" };

export default async function EventJudgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true, status: true,
      eventCompetitions: {
        include: {
          competition: {
            select: {
              id: true, name: true, code: true, participationType: true,
              targetGroups: { select: { targetGroup: { select: { schoolLevel: true } } } },
            },
          },
          judgingTemplates: {
            include: {
              judgingTemplate: {
                select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
              },
            },
          },
          judgingTasks: {
            include: { judgingTemplate: { select: { id: true, name: true, code: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventJudgingClient
        event={{ id: event.id, name: event.name, slug: event.slug, scope: event.scope }}
        competitions={event.eventCompetitions}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
      />
    </OrganizerShell>
  );
}
