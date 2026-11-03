import { Award, Download, Globe } from "lucide-react";
import type { SeasonCert } from "@/lib/certificates/portal";

// Certificates grouped by Techlympics year (newest first), as tiles that open
// the PDF. Shared by the manager's participant page and the participant portal.

const LEVEL: Record<string, string> = { SCHOOL: "Peringkat Sekolah", STATE: "Peringkat Negeri", NATIONAL: "Peringkat Kebangsaan" };

function CertTile({ c }: { c: SeasonCert }) {
  const achievement = c.kind === "ACHIEVEMENT";
  return (
    <a href={`/api/v2/certificates/${c.id}/download`}
      className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
      <span className={`relative flex h-11 w-9 shrink-0 items-center justify-center rounded-[3px] border-2 ${achievement ? "border-violet-300 bg-gradient-to-b from-violet-500 to-violet-700" : "border-emerald-300 bg-gradient-to-b from-emerald-500 to-emerald-700"}`}>
        <Award className="h-4 w-4 text-white" />
        {c.online && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sky-500 dark:border-zinc-900">
            <Globe className="h-3 w-3 text-white" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.label}</span>
        <span className="block truncate text-[11px] text-zinc-500">
          {achievement ? "Pencapaian" : "Penyertaan"}
          {LEVEL[c.level] && ` · ${LEVEL[c.level]}`}
          {c.online && " · Dalam talian"}
          {c.eventName && ` · ${c.eventName}`}
        </span>
        <span className="block font-mono text-[10px] text-zinc-400">{c.serialNumber}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-blue-600" />
    </a>
  );
}

export function SeasonCertList({ certs, columns = 2 }: { certs: SeasonCert[]; columns?: 1 | 2 }) {
  const bySeason = new Map<number, SeasonCert[]>();
  for (const c of certs) bySeason.set(c.seasonYear, [...(bySeason.get(c.seasonYear) ?? []), c]);
  return (
    <div className="space-y-5">
      {[...bySeason.entries()].map(([year, list]) => (
        <div key={year}>
          <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Techlympics {year}
            <span className="text-[11px] font-normal text-zinc-400">{list.length} sijil</span>
          </h3>
          <div className={columns === 2 ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
            {list.map(c => <CertTile key={c.id} c={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
