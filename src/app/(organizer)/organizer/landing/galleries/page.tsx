import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { GalleriesClient } from "@/components/organizer/landing/GalleriesClient";

export const metadata: Metadata = { title: "Galleries" };

export default async function GalleriesPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="p-6 max-w-6xl mx-auto">
        <GalleriesClient />
      </div>
    </OrganizerShell>
  );
}
