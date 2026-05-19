import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ManagerDetailClient } from "@/components/organizer/participation/ManagerDetailClient";

export const metadata: Metadata = { title: "Manager Detail" };

export default async function ManagerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { id } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { id },
    include: {
      school:            { select: { id: true, name: true } },
      higherInstitution: { select: { id: true, name: true } },
      contingentManagers: {
        orderBy: { createdAt: "asc" },
        include: {
          contingent: {
            select: {
              id: true, name: true, shortName: true, contingentType: true, status: true,
              state: { select: { id: true, name: true } },
              _count: { select: { participants: true, teams: true } },
            },
          },
        },
      },
    },
  });

  if (!manager) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ManagerDetailClient data={manager as any} />
    </OrganizerShell>
  );
}
