import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { KnowledgeBaseClient } from "@/components/organizer/knowledge-base/KnowledgeBaseClient";

export const metadata: Metadata = { title: "Knowledge Base" };

export default async function KnowledgeBasePage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <KnowledgeBaseClient role={session.role} />
    </OrganizerShell>
  );
}
