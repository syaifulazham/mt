import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { CertificateDistributionClient } from "@/components/organizer/certificates/CertificateDistributionClient";

export const metadata: Metadata = { title: "Certificate Distribution" };

export default async function CertificateDistributionPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <CertificateDistributionClient />
    </OrganizerShell>
  );
}
