import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { PajskSettingsClient } from "@/components/organizer/certificates/PajskSettingsClient";

export const metadata: Metadata = { title: "PAJSK (Beta)" };

export default async function PajskSettingsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <PajskSettingsClient />
    </OrganizerShell>
  );
}
