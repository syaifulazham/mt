import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { ENDPOINT_SELECT, MEDIA_ADMIN_ROLES, endpointDto } from "@/lib/media-endpoint";
import { MediaEndpointsClient, type MediaEndpointItem } from "@/components/organizer/events/MediaEndpointsClient";

export const metadata: Metadata = { title: "Media" };

export default async function EventMediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug } = await params;
  if (!MEDIA_ADMIN_ROLES.includes(session.role)) redirect(`/organizer/events/${slug}/manage`);

  const event = await db.event.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!event) redirect("/organizer/events");
  const rows = await db.mediaEndpoint.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" }, select: ENDPOINT_SELECT });
  const endpoints = rows.map(r => {
    const d = endpointDto(r);
    return { ...d, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null } as MediaEndpointItem;
  });

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <MediaEndpointsClient event={event} initial={endpoints} />
    </OrganizerShell>
  );
}
