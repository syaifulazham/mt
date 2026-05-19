import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SmartChatClient } from "@/components/organizer/smart-chat/SmartChatClient";

export const metadata: Metadata = { title: "Smart Chat" };

export default async function SmartChatPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SmartChatClient role={session.role} />
    </OrganizerShell>
  );
}
