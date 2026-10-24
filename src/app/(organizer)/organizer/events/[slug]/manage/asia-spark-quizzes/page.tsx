import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { QuizzlyMonitorClient } from "@/components/organizer/events/QuizzlyMonitorClient";

export const metadata: Metadata = { title: "Asia Spark Quizzes" };

export default async function QuizzlyMonitorPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <QuizzlyMonitorClient event={event} />
    </OrganizerShell>
  );
}
