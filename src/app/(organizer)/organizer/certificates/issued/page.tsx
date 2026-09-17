import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { IssuedCertificatesClient } from "@/components/organizer/certificates/IssuedCertificatesClient";

export const metadata: Metadata = { title: "Issued certificates" };

export default async function IssuedCertificatesPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}>
        <IssuedCertificatesClient />
      </Suspense>
    </OrganizerShell>
  );
}
