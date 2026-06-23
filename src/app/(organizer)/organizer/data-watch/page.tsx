import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { DataWatchClient } from "@/components/organizer/DataWatchClient";

export const metadata: Metadata = { title: "Data Watch" };

export default async function DataWatchPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) redirect("/organizer/dashboard");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Data Watch</h1>
          <p className="text-sm text-zinc-500">Monitor and repair data quality issues in participant records.</p>
        </div>
        <DataWatchClient />
      </div>
    </OrganizerShell>
  );
}
