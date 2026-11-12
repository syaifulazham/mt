import Link from "next/link";
import { Award, AlertTriangle } from "lucide-react";
import type { AwardDto } from "@/lib/special-awards";
import { cn } from "@/lib/utils";

const PLACE = ["", "bg-amber-100 text-amber-800", "bg-zinc-200 text-zinc-700", "bg-orange-100 text-orange-800"];

/** Keputusan: the event's Anugerah Tambahan and their winners (read-only; managed on /manage/awards). */
export function SpecialAwardsSummary({ awards, eventSlug }: { awards: AwardDto[]; eventSlug: string }) {
  return (
    <section className="mx-auto max-w-6xl space-y-3 px-6 pb-10">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900"><Award className="h-4 w-4 text-fuchsia-600" /> Anugerah Tambahan</h2>
        <Link href={`/organizer/events/${eventSlug}/manage/awards`} className="ml-auto text-xs font-semibold text-fuchsia-600 hover:underline">Urus anugerah →</Link>
      </div>
      {awards.length === 0 ? (
        <p className="rounded-xl border border-dashed py-6 text-center text-sm text-zinc-400">Tiada anugerah tambahan.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {awards.map(a => (
            <div key={a.id} className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">{a.name}</p>
              <p className="text-[11px] text-zinc-400">
                {a.competition ? `${a.competition.code} ${a.competition.name}` : "Bebas"} · {a.recipientType === "INDIVIDUAL" ? "Individu" : "Pasukan"}
                {a.method === "TEMPLATE" && ` · ${a.templates.map(t => t.name).join(" + ")}`}
              </p>
              {a.warning && <p className="mt-2 flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a.warning}</p>}
              <ul className="mt-2 space-y-1.5">
                {a.winners.length === 0 && <li className="text-xs text-zinc-400">Belum ada pemenang.</li>}
                {a.winners.map((w, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", PLACE[w.rank] ?? "bg-zinc-100 text-zinc-600")}>{w.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-medium text-zinc-800">{w.participantName ?? w.teamName}</span>
                      <span className="text-zinc-400"> · {[w.participantName ? w.teamName : null, w.contingentName ?? w.stateName].filter(Boolean).join(" · ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
