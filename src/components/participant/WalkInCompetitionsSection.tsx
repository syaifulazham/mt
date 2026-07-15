import { MapPin, Calendar, Users, ArrowRight } from "lucide-react";

type WalkInEntry = {
  id: string;
  maxSlots: number;
  registrations: number;
  event: {
    id: string; name: string; slug: string;
    venue: string | null; startDate: string | null; endDate: string | null;
  };
  competition: { id: string; code: string; name: string; participationType: string };
};

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function WalkInCompetitionsSection({ walkInCompetitions }: { walkInCompetitions: WalkInEntry[] }) {
  // Group by event
  const byEvent = new Map<string, { event: WalkInEntry["event"]; items: WalkInEntry[] }>();
  for (const wic of walkInCompetitions) {
    if (!byEvent.has(wic.event.id)) byEvent.set(wic.event.id, { event: wic.event, items: [] });
    byEvent.get(wic.event.id)!.items.push(wic);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold dark:text-zinc-100">Pertandingan Walk-in</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pertandingan berikut boleh disertai secara langsung di kaunter pendaftaran pada hari acara.
        </p>
      </div>

      {Array.from(byEvent.values()).map(({ event, items }) => (
        <div key={event.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* Event header */}
          <div className="px-4 py-3 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-100 dark:border-teal-900 flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">{event.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-teal-700/70 dark:text-teal-400/70">
                {event.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {event.venue}
                  </span>
                )}
                {(event.startDate || event.endDate) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {event.startDate === event.endDate
                      ? fmt(event.startDate)
                      : `${fmt(event.startDate) ?? "?"} – ${fmt(event.endDate) ?? "?"}`}
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 tracking-wide uppercase">
              Walk-in
            </span>
          </div>

          {/* Competition rows */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map(wic => {
              const full = wic.maxSlots > 0 && wic.registrations >= wic.maxSlots;
              const pct  = wic.maxSlots > 0 ? Math.min(100, Math.round((wic.registrations / wic.maxSlots) * 100)) : null;

              return (
                <div key={wic.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      <span className="font-mono text-xs text-zinc-400 mr-1.5">{wic.competition.code}</span>
                      {wic.competition.name}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5 capitalize">{wic.competition.participationType.toLowerCase()}</p>
                  </div>

                  {/* Slot indicator */}
                  <div className="shrink-0 text-right space-y-1 min-w-[80px]">
                    <div className="flex items-center justify-end gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Users className="h-3 w-3" />
                      <span>
                        {wic.registrations}
                        {wic.maxSlots > 0 ? ` / ${wic.maxSlots}` : " daftar"}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="w-20 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${full ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-teal-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    full
                      ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                  }`}>
                    {full ? "Penuh" : "Tersedia"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 text-xs text-zinc-400">
            <ArrowRight className="h-3 w-3 shrink-0" />
            Hadir ke kaunter pendaftaran walk-in pada hari acara untuk mendaftar.
          </div>
        </div>
      ))}
    </div>
  );
}
