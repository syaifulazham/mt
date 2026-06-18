import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { AnnouncementsClient } from "@/components/organizer/landing/AnnouncementsClient";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const raw = await db.announcement.findMany({ orderBy: { createdAt: "desc" } });
  const announcements = raw.map((a) => ({
    ...a,
    createdAt:   a.createdAt.toISOString(),
    updatedAt:   a.updatedAt.toISOString(),
    publishedAt: a.publishedAt?.toISOString() ?? null,
  }));

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <AnnouncementsClient initial={announcements} />
    </OrganizerShell>
  );
}
