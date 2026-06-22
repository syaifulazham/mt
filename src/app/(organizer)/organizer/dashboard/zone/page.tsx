import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { DashboardTabNav } from "@/components/organizer/dashboard/DashboardTabNav";
import { ZoneDashboardClient } from "@/components/organizer/dashboard/ZoneDashboardClient";

export const metadata: Metadata = { title: "Dashboard – By Zone" };

export default async function DashboardZonePage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <DashboardTabNav />
      <ZoneDashboardClient />
    </OrganizerShell>
  );
}
