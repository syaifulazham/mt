import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SchoolLevelCompetitionDetail } from "@/components/organizer/participation/SchoolLevelCompetitionDetail";
import { getSchoolLevelCompetition } from "@/lib/schoolLevelStats";

export const metadata: Metadata = { title: "School Level — Competition" };
export const dynamic = "force-dynamic";

export default async function SchoolLevelCompetitionPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { competitionId } = await params;
  const stats = await getSchoolLevelCompetition(competitionId);
  if (!stats) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SchoolLevelCompetitionDetail stats={stats} canDownload={session.role !== "VIEWER"} />
    </OrganizerShell>
  );
}
