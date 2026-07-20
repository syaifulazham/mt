import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { EventsClient } from "@/components/organizer/events/EventsClient";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const hasViblockKey = !!process.env.WALKIN_EPTIM_VIBLOCK_API_KEY;
  const hasDroneKey   = !!process.env.WALKIN_EPTIM_DRONE_API_KEY;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventsClient role={session.role} hasViblockKey={hasViblockKey} hasDroneKey={hasDroneKey} />
    </OrganizerShell>
  );
}
