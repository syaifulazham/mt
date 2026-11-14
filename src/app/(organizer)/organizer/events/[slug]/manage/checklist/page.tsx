import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { eventChecklist } from "@/lib/eventChecklist";
import { EventChecklistClient } from "@/components/organizer/events/EventChecklistClient";

export const metadata: Metadata = { title: "Senarai Semak Pertandingan" };

export default async function EventChecklistPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { id: true } });
  if (!event) redirect("/organizer/events");
  const data = await eventChecklist(event.id);
  if (!data) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventChecklistClient initial={data} />
    </OrganizerShell>
  );
}
