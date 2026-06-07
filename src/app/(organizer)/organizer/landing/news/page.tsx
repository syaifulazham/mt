import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { Newspaper } from "lucide-react";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-100">
            <Newspaper className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">News</h1>
            <p className="text-sm text-zinc-500">Manage news articles displayed on the landing page.</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center h-48">
          <p className="text-sm text-zinc-400">News management coming soon.</p>
        </div>
      </div>
    </OrganizerShell>
  );
}
