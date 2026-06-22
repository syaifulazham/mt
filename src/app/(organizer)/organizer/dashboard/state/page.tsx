import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { DashboardTabNav } from "@/components/organizer/dashboard/DashboardTabNav";
import { StateDashboardClient } from "@/components/organizer/dashboard/StateDashboardClient";

export const metadata: Metadata = { title: "Dashboard – By State" };

export default async function DashboardStatePage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <DashboardTabNav />
      <StateDashboardClient />
    </OrganizerShell>
  );
}
