import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { WorkshopsClient } from "@/components/organizer/workshops/WorkshopsClient";
import { getWorkshopStats } from "@/lib/workshopStats";
import { loadWorkshopCourses } from "@/lib/workshopCourses";

export const metadata: Metadata = { title: "Workshops" };
export const dynamic = "force-dynamic";

export default async function WorkshopsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const [stats, lms] = await Promise.all([getWorkshopStats(), loadWorkshopCourses()]);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WorkshopsClient stats={stats} courses={lms.courses} lmsError={lms.error} />
    </OrganizerShell>
  );
}
