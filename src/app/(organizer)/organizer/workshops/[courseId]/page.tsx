import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { WorkshopDetail } from "@/components/organizer/workshops/WorkshopDetail";
import { getWorkshopStats } from "@/lib/workshopStats";
import { loadWorkshopCourses } from "@/lib/workshopCourses";

export const metadata: Metadata = { title: "Workshop" };
export const dynamic = "force-dynamic";

export default async function WorkshopDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { courseId } = await params;
  const [stats, lms] = await Promise.all([getWorkshopStats(courseId), loadWorkshopCourses()]);
  const workshop = stats.workshops[0];
  if (!workshop) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WorkshopDetail
        workshop={workshop}
        course={lms.courses[courseId] ?? null}
        lmsError={lms.error}
        canDownload={session.role !== "VIEWER"}
      />
    </OrganizerShell>
  );
}
