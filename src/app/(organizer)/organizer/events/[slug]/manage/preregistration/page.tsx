import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { EventPreregistrationClient } from "@/components/organizer/events/EventPreregistrationClient";

export const metadata: Metadata = { title: "Pra-Pendaftaran" };

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
      prerequisites: {
        select: { prerequisite: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventPreregistrationClient
        event={{
          id:           event.id,
          name:         event.name,
          slug:         event.slug,
          prerequisites: event.prerequisites,
        }}
      />
    </OrganizerShell>
  );
}
