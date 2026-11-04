import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { INTERNATIONAL_ROLES } from "@/lib/international";
import { InternationalParticipationClient } from "@/components/organizer/events/InternationalParticipationClient";

export const metadata: Metadata = { title: "Penyertaan Antarabangsa" };

export default async function EventInternationalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  if (!(INTERNATIONAL_ROLES as readonly string[]).includes(session.role))
    redirect(`/organizer/events/${slug}/manage`);

  const event = await db.event.findUnique({
    where:  { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <InternationalParticipationClient event={event} />
    </OrganizerShell>
  );
}
