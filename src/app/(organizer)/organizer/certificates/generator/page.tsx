import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { CertificateGeneratorClient } from "@/components/organizer/certificates/CertificateGeneratorClient";

export const metadata: Metadata = { title: "Certificate Generator" };

export default async function CertificateGeneratorPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) redirect("/organizer/certificates");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <CertificateGeneratorClient />
    </OrganizerShell>
  );
}
