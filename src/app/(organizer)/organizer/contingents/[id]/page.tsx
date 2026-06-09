import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ContingentOrgDetailClient } from "@/components/organizer/contingents/ContingentOrgDetailClient";

export const metadata: Metadata = { title: "Contingent Detail — Techlympics Organizer" };

export default async function ContingentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { id } = await params;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ContingentOrgDetailClient contingentId={id} />
    </OrganizerShell>
  );
}
