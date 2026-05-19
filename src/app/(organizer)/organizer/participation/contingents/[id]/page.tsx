import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ContingentDetailClient } from "@/components/organizer/participation/ContingentDetailClient";

export const metadata: Metadata = { title: "Contingent Detail" };

export default async function ContingentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { id } = await params;

  const contingent = await db.contingent.findUnique({
    where: { id },
    include: {
      school:            { select: { id: true, name: true } },
      higherInstitution: { select: { id: true, name: true } },
      state:             { select: { id: true, name: true } },
      zone:              { select: { id: true, name: true } },
      managers: {
        where:   { status: "ACTIVE" },
        orderBy: { role: "asc" },
        include: { manager: { select: { id: true, name: true, email: true, phone: true } } },
      },
      participants: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, gender: true, eduLevel: true, ppki: true, age: true },
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
          competition: { select: { id: true, code: true, name: true, participationType: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!contingent) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ContingentDetailClient data={contingent as any} />
    </OrganizerShell>
  );
}
