import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { CertificateGeneratorClient, type GroupBy } from "@/components/organizer/certificates/CertificateGeneratorClient";
import { GENERATOR_GROUP_COOKIE, GENERATOR_GROUP_VALUES } from "@/components/organizer/certificates/generatorCookie";

export const metadata: Metadata = { title: "Certificate Generator" };

export default async function CertificateGeneratorPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) redirect("/organizer/certificates");

  // Last "Kumpulkan ikut" choice (cookie set by the page)
  const saved = (await cookies()).get(GENERATOR_GROUP_COOKIE)?.value;
  const initialGroupBy: GroupBy = (GENERATOR_GROUP_VALUES as readonly string[]).includes(saved ?? "") ? saved as GroupBy : "none";

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <CertificateGeneratorClient initialGroupBy={initialGroupBy} />
    </OrganizerShell>
  );
}
