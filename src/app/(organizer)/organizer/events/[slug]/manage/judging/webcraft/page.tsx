import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { loadWebcraftRoster } from "@/lib/webcraftJudging";
import { EventWebcraftJudgingClient } from "@/components/organizer/events/EventWebcraftJudgingClient";

export const metadata: Metadata = { title: "Penghakiman Webcraft" };

/**
 * Roster only — local and fast. Published projects come from WebCraft and are
 * fetched by the client after first paint, so a slow upstream never holds up
 * the page.
 */
export default async function EventWebcraftJudgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!event) redirect("/organizer/events");

  const competitions = await loadWebcraftRoster(event.id);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventWebcraftJudgingClient event={event} competitions={competitions} />
    </OrganizerShell>
  );
}
