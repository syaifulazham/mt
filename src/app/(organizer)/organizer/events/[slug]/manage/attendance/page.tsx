import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { AttendanceManageClient } from "@/components/organizer/events/AttendanceManageClient";

export const metadata: Metadata = { title: "Log Kehadiran Peserta" };

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <AttendanceManageClient event={{ id: event.id, name: event.name, slug: event.slug }} />
    </OrganizerShell>
  );
}
