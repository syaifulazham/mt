import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { announcementBoard } from "@/lib/announcements";
import { AnnouncementsManageClient } from "@/components/organizer/events/AnnouncementsManageClient";

export const metadata: Metadata = { title: "Pengumuman" };

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({
    where:  { slug },
    select: {
      id: true, name: true, slug: true,
      announcementEndpoints: {
        orderBy: { createdAt: "asc" },
        select: { id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true },
      },
    },
  });
  if (!event) redirect("/organizer/events");

  const board = await announcementBoard(event.id);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <AnnouncementsManageClient
        event={{ id: event.id, name: event.name, slug: event.slug }}
        endpoints={event.announcementEndpoints.map(e => ({ ...e, createdAt: e.createdAt.toISOString() }))}
        board={board}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
      />
    </OrganizerShell>
  );
}
