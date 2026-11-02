import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SettingsClient } from "@/components/organizer/SettingsClient";
import { isRegistrationOpen } from "@/lib/registration";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (session.role !== "SUPER_ADMIN") redirect("/organizer/dashboard");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SettingsClient initialOpen={await isRegistrationOpen()} />
    </OrganizerShell>
  );
}
