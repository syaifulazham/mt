import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { BackupsClient } from "@/components/organizer/BackupsClient";

export const metadata: Metadata = { title: "DB Backups" };

export default async function BackupsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (session.role !== "SUPER_ADMIN") redirect("/organizer/dashboard");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <BackupsClient />
    </OrganizerShell>
  );
}
