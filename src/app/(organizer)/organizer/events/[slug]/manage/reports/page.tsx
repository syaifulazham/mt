import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventReportsClient } from "@/components/organizer/events/EventReportsClient";

export const metadata: Metadata = { title: "Laporan" };

export default async function EventReportsPage({ params }: { params: Promise<{ slug: string }> }) {
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
      <EventReportsClient
        eventId={event.id}
        eventName={event.name}
        slug={event.slug}
      />
    </OrganizerShell>
  );
}
