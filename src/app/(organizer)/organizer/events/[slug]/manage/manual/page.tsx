import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { JudgingManual } from "@/components/organizer/manual/JudgingManual";

export const metadata: Metadata = { title: "Manual Penghakiman" };

export default async function JudgingManualPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { name: true, slug: true } });
  if (!event) redirect("/organizer/events");
  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <JudgingManual event={event} />
    </OrganizerShell>
  );
}
