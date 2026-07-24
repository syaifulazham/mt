import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventPreregistrationClient } from "@/components/organizer/events/EventPreregistrationClient";

export const metadata: Metadata = { title: "Pra-Pendaftaran" };

const ZONE_SCOPES = ["ZONE", "ONLINE_ZONE"];

export default async function EventPreregistrationPage({
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
      id: true,
      name: true,
      slug: true,
      scope: true,
      prerequisites: {
        select: { prerequisite: { select: { id: true, name: true, slug: true } } },
      },
      zone: {
        select: {
          states: {
            select: { state: { select: { id: true, name: true } } },
            orderBy: { state: { name: "asc" } },
          },
        },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  const zoneStates = ZONE_SCOPES.includes(event.scope)
    ? (event.zone?.states.map((s) => s.state) ?? [])
    : [];

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventPreregistrationClient
        event={{
          id:            event.id,
          name:          event.name,
          slug:          event.slug,
          scope:         event.scope,
          zoneStates,
          prerequisites: event.prerequisites,
        }}
      />
    </OrganizerShell>
  );
}
