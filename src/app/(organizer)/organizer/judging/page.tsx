import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { JudgingTemplatesClient } from "@/components/organizer/judging/JudgingTemplatesClient";

export const metadata: Metadata = { title: "Judging" };

export default async function JudgingPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <JudgingTemplatesClient role={session.role} />
    </OrganizerShell>
  );
}
