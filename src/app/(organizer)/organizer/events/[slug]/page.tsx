import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { EventDetailClient } from "@/components/organizer/events/EventDetailClient";

export const metadata: Metadata = { title: "Event Detail" };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventDetailClient slug={slug} role={session.role} />
    </OrganizerShell>
  );
}
