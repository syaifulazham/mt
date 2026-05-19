import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ParticipantDetailClient } from "@/components/organizer/participation/ParticipantDetailClient";

export const metadata: Metadata = { title: "Participant Detail" };

export default async function ParticipantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { id } = await params;

  const participant = await db.participant.findUnique({
    where: { id },
    include: {
      contingent: {
        select: {
          id: true, name: true, shortName: true, contingentType: true,
          school:            { select: { id: true, name: true } },
          higherInstitution: { select: { id: true, name: true } },
        },
      },
      teamMembers: {
        include: {
          team: {
            include: {
              competition: { select: { id: true, code: true, name: true, participationType: true } },
              contingent:  { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!participant) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ParticipantDetailClient data={participant} />
    </OrganizerShell>
  );
}
