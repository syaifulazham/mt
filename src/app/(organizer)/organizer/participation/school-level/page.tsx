import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SchoolLevelClient } from "@/components/organizer/participation/SchoolLevelClient";

export const metadata: Metadata = { title: "School Level" };

// The figures are computed by the client in steps (overview, then each level),
// so the page can show the processing as it happens.
export default async function SchoolLevelPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SchoolLevelClient />
    </OrganizerShell>
  );
}
