import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ParticipationClient } from "@/components/organizer/participation/ParticipationClient";

export const metadata: Metadata = { title: "Participation" };

export default async function ParticipationPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ParticipationClient />
    </OrganizerShell>
  );
}
