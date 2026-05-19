import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { CompetitionsClient } from "@/components/organizer/competitions/CompetitionsClient";

export const metadata: Metadata = { title: "Competitions" };

export default async function CompetitionsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}>
        <CompetitionsClient role={session.role} />
      </Suspense>
    </OrganizerShell>
  );
}
