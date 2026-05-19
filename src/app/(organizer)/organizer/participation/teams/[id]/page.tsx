import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { TeamDetailClient } from "@/components/organizer/participation/TeamDetailClient";

export const metadata: Metadata = { title: "Team Detail" };

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { id } = await params;

  const team = await db.team.findUnique({
    where: { id },
    include: {
      competition: { select: { id: true, code: true, name: true, participationType: true, minTeamSize: true, maxTeamSize: true } },
      contingent:  { select: { id: true, name: true, shortName: true, contingentType: true } },
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          participant: { select: { id: true, name: true, gender: true, eduLevel: true, age: true, ic: true, ppki: true } },
        },
      },
      trainers: {
        orderBy: { createdAt: "asc" },
        include: {
          trainer: { select: { id: true, name: true, email: true, phoneNumber: true } },
        },
      },
    },
  });

  if (!team) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <TeamDetailClient data={team} />
    </OrganizerShell>
  );
}
