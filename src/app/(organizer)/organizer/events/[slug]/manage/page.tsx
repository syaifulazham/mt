import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventManageClient } from "@/components/organizer/events/EventManageClient";

export const metadata: Metadata = { title: "Urus Acara" };

export default async function EventManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, scope: true, status: true, startDate: true, endDate: true },
  });

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventManageClient event={event} role={session.role} />
    </OrganizerShell>
  );
}
