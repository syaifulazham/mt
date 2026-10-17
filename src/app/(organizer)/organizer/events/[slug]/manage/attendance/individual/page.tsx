import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { individualAttendance } from "@/lib/individualAttendance";
import { IndividualAttendanceClient } from "@/components/organizer/events/IndividualAttendanceClient";

export const metadata: Metadata = { title: "Kehadiran Individu" };
export const dynamic = "force-dynamic";

export default async function IndividualAttendancePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!event) notFound();

  const data = await individualAttendance(event.id);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <IndividualAttendanceClient event={event} data={data} generatedAt={new Date().toISOString()} />
    </OrganizerShell>
  );
}
