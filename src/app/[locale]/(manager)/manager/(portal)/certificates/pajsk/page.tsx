import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { managerMaySee } from "@/lib/pajsk/access";
import { getPajskSeason, syncEntries, type PajskEntry } from "@/lib/pajsk/entries";
import { BetaBadge, PajskEntryList, PajskRulesNote } from "@/components/pajsk/PajskEntryList";

export const metadata: Metadata = { title: "PAJSK", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Manager portal → Certificates → PAJSK (Beta): PAJSK marks of the manager's
// contingent participants. Visible to the testers the organizer listed, or to
// every manager once PAJSK is switched on for all.
export default async function ManagerPajskPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    select: { email: true, profileComplete: true, contingentManagers: { where: { status: "ACTIVE" }, select: { contingentId: true } } },
  });
  if (!manager?.profileComplete) redirect("/manager/onboarding");
  if (!(await managerMaySee(manager.email))) redirect("/manager/certificates");

  const season = await getPajskSeason();
  const participants = await db.participant.findMany({
    where: { contingentId: { in: manager.contingentManagers.map(c => c.contingentId) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const entries = season ? await syncEntries(season, participants.map(p => p.id)) : [];
  const byParticipant = new Map<string, PajskEntry[]>();
  for (const e of entries) byParticipant.set(e.participantId, [...(byParticipant.get(e.participantId) ?? []), e]);
  const shown = participants.filter(p => byParticipant.has(p.id));

  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/manager/certificates" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Certificates
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold dark:text-zinc-100">PAJSK <BetaBadge /></h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Markah PAJSK peserta kontinjen anda, setiap pertandingan, dengan sijil PAJSK. {shown.length} daripada {participants.length} peserta mempunyai markah.
        </p>
      </div>

      {!season ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Peraturan markah PAJSK bagi musim ini belum ditetapkan.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Tiada markah PAJSK lagi. Markah dipaparkan selepas sijil penyertaan atau pencapaian dikeluarkan.
        </p>
      ) : (
        <div className="space-y-6">
          {shown.map(p => (
            <section key={p.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{p.name}</h2>
              <PajskEntryList entries={byParticipant.get(p.id)!} rules={season.rules} />
            </section>
          ))}
        </div>
      )}
      {season && <PajskRulesNote rules={season.rules} />}
    </div>
  );
}
