import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import AttendanceDashboardClient from "@/components/organizer/events/AttendanceDashboardClient";

export const metadata: Metadata = { title: "Dashboard Kehadiran" };

export default async function AttendanceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id:        true,
      name:      true,
      slug:      true,
      venue:     true,
      address:   true,
      city:      true,
      latitude:  true,
      longitude: true,
      startDate: true,
      endDate:   true,
      state:     { select: { name: true } },
    },
  });

  if (!event) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <AttendanceDashboardClient event={event} />
    </OrganizerShell>
  );
}
