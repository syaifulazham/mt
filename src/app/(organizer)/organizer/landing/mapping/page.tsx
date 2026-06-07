import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { MappingClient } from "@/components/organizer/mapping/MappingClient";
import { getAllClusters } from "@/lib/mapping-db";

export const metadata: Metadata = { title: "Competition Mapping" };

export default async function MappingPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const clusters = getAllClusters();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
        <MappingClient initialClusters={clusters} />
      </div>
    </OrganizerShell>
  );
}
