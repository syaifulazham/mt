// PAJSK entries as cards — shared by the participant and manager portals.
// Server-renderable (no hooks); downloads are plain links to the PDF route.
import { Download, Medal } from "lucide-react";
import { PajskViewButton } from "./PajskViewButton";
import { formatCode } from "@/lib/pajsk/code";
import { placeLabel, type PajskRules } from "@/lib/pajsk/rules";
import type { PajskEntry } from "@/lib/pajsk/entries";

export function BetaBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      Beta
    </span>
  );
}

export function PajskEntryList({ entries, rules }: { entries: PajskEntry[]; rules: PajskRules }) {
  return (
    <ul className="space-y-3">
      {entries.map(e => (
        <li
          key={e.id}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          style={{ borderLeft: `4px solid ${e.colour}` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-1">
              <p className="font-semibold leading-snug dark:text-zinc-100">
                <span className="mr-1.5 font-mono text-sm text-zinc-500 dark:text-zinc-400">{e.competitionCode}</span>
                {e.competitionName}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: e.colour }}>
                  {e.stageLabel}
                </span>
                {e.placing && (
                  <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                    {e.medal && <Medal className="h-3.5 w-3.5 text-amber-500" />}
                    {placeLabel(e.placing)}{e.medal ? ` · ${e.medal}` : ""}
                    <span className="font-normal text-zinc-500">({e.placingStageLabel})</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PajskViewButton id={e.id} title={`Sijil PAJSK — ${e.competitionCode} ${e.competitionName ?? ""}`.trim()} />
              <a
                href={`/api/v2/pajsk/certificates/${e.id}/pdf`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Download className="h-3.5 w-3.5" /> Sijil PDF
              </a>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-zinc-100 text-sm dark:border-zinc-800 sm:grid-cols-3">
            <div className="px-4 py-2.5">
              <dt className="text-[11px] text-zinc-500">Pelibatan ({rules.pelibatan.label}, {rules.pelibatan.level})</dt>
              <dd className="text-lg font-bold" style={{ color: e.colour }}>{e.pelibatanMarks}</dd>
            </div>
            <div className="px-4 py-2.5">
              <dt className="text-[11px] text-zinc-500">Pencapaian ({rules.pencapaian.level})</dt>
              <dd className="text-lg font-bold" style={{ color: e.pencapaianMarks != null ? e.colour : undefined }}>
                {e.pencapaianMarks ?? <span className="text-sm font-normal text-zinc-400">—</span>}
              </dd>
            </div>
            <div className="col-span-2 px-4 py-2.5 sm:col-span-1">
              <dt className="text-[11px] text-zinc-500">Kod pengesahan</dt>
              <dd className="font-mono text-sm font-semibold tracking-wider dark:text-zinc-200">{formatCode(e.code)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function PajskRulesNote({ rules }: { rules: PajskRules }) {
  const places = Object.entries(rules.pencapaian.marksByPlace)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([p, m]) => `${p}=${m}`).join(", ");
  return (
    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      Markah {rules.reference ? `mengikut ${rules.reference}` : "PAJSK"}: setiap penyertaan diberi {rules.pelibatan.label}, {" "}
      {rules.pelibatan.level} = {rules.pelibatan.marks}; Pencapaian mengikut tempat ({places}). Warna sijil mengikut peringkat
      tertinggi yang dicapai. Markah dikira daripada sijil penyertaan dan pencapaian yang telah dikeluarkan.
    </p>
  );
}
