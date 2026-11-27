import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { participantMaySee } from "@/lib/pajsk/access";
import { getPajskSeason, syncEntries } from "@/lib/pajsk/entries";
import { BetaBadge, PajskEntryList, PajskRulesNote } from "@/components/pajsk/PajskEntryList";
import { SijilTabs } from "@/components/participant/SijilTabs";

export const metadata: Metadata = { title: "PAJSK", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Participant portal → Sijil → PAJSK (Beta): the participant's own PAJSK marks,
// one per competition, derived from their issued certificates
// (src/lib/pajsk/entries.ts), each with a downloadable certificate.
export default async function PajskPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");
  if (!(await participantMaySee(session.contingentId))) redirect("/participant/certificates");

  const season = await getPajskSeason();
  const entries = season ? await syncEntries(season, [session.participantId]) : [];

  return (
    <div className="max-w-3xl space-y-5">
      <SijilTabs active="pajsk" />
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold dark:text-zinc-100">PAJSK <BetaBadge /></h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Markah Pentaksiran Aktiviti Jasmani, Sukan dan Kokurikulum (PAJSK) bagi setiap pertandingan anda
          {season ? ` dalam ${season.rules.programme}` : ""}.
        </p>
      </div>

      {!season ? (
        <Empty title="PAJSK belum tersedia" text="Peraturan markah PAJSK bagi musim ini belum ditetapkan." />
      ) : entries.length === 0 ? (
        <Empty
          title="Tiada markah PAJSK lagi"
          text="Markah PAJSK dipaparkan selepas sijil penyertaan atau pencapaian anda dikeluarkan oleh penganjur."
        />
      ) : (
        <PajskEntryList entries={entries} rules={season.rules} />
      )}

      {season && <PajskRulesNote rules={season.rules} />}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Ciri ini dalam ujian (Beta). Jika markah anda tidak tepat, maklumkan kepada pengurus kontinjen anda.
      </p>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="rounded-full bg-sky-50 p-5 dark:bg-sky-950/30">
        <ClipboardCheck className="h-10 w-10 text-sky-500" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold dark:text-zinc-100">{title}</h2>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
      </div>
    </div>
  );
}
