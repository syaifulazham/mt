import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/organizer/Sidebar";
import { ReferenceDataClient } from "./ReferenceDataClient";

export const metadata: Metadata = { title: "Reference Data" };

export default async function ReferenceDataPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={session.name} role={session.role} />
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-8">
        <ReferenceDataClient />
      </main>
    </div>
  );
}
