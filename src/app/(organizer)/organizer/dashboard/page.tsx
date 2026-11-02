import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { DashboardTabNav } from "@/components/organizer/dashboard/DashboardTabNav";
import { DashboardClient } from "@/components/organizer/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function OrganizerDashboardPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <DashboardTabNav role={session.role} />
      <DashboardClient userName={session.name} />
    </OrganizerShell>
  );
}
