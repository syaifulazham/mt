import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ContingentsClient } from "@/components/organizer/contingents/ContingentsClient";

export const metadata: Metadata = { title: "Contingents — Techlympics Organizer" };

export default async function ContingentsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ContingentsClient />
    </OrganizerShell>
  );
}
