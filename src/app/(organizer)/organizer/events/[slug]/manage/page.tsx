import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventManageClient } from "@/components/organizer/events/EventManageClient";
import { eventHasWebcraft } from "@/lib/webcraftJudging";
import { eventHasCsi } from "@/lib/csiMonitor";

export const metadata: Metadata = { title: "Urus Acara" };

export default async function EventManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  // The WebCraft check is keyed by slug so it runs alongside the event lookup
  // rather than after it — the canvas costs no extra round trip.
  const [event, hasWebcraft, hasCsi] = await Promise.all([
    db.event.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, scope: true, status: true, startDate: true, endDate: true },
    }),
    eventHasWebcraft(slug),
    eventHasCsi(slug),
  ]);

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventManageClient event={event} role={session.role} hasWebcraft={hasWebcraft} hasCsi={hasCsi} />
    </OrganizerShell>
  );
}
