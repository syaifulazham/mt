"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Eye, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GEN_CERTS_GROUP_COOKIE, type GenCertsGroupBy } from "./generatorCertsCookie";

type ZipFormat = "single" | "competition" | "state" | "contingent";
const ZIP_FORMATS: { key: ZipFormat; label: string; hint: string }[] = [
  { key: "single",      label: "Setiap sijil",     hint: "Satu PDF bagi setiap sijil (dalam folder pertandingan)." },
  { key: "competition", label: "Ikut pertandingan", hint: "Satu PDF berbilang halaman bagi setiap pertandingan." },
  { key: "state",       label: "Ikut negeri",       hint: "Satu PDF berbilang halaman bagi setiap negeri." },
  { key: "contingent",  label: "Ikut kontinjen",    hint: "Satu PDF berbilang halaman bagi setiap kontinjen, dalam folder negeri." },
];

const GROUPS: { key: GenCertsGroupBy; label: string }[] = [
  { key: "none", label: "Tiada" }, { key: "state", label: "Negeri" },
  { key: "rank", label: "Kedudukan" }, { key: "competition", label: "Pertandingan" },
];

/** Remember the grouping for a year; "none" clears it. */
function saveGroupCookie(g: GenCertsGroupBy) {
  document.cookie = g === "none"
    ? `${GEN_CERTS_GROUP_COOKIE}=; path=/organizer/certificates/generator; max-age=0; samesite=lax`
    : `${GEN_CERTS_GROUP_COOKIE}=${g}; path=/organizer/certificates/generator; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Certificates → Generator → one generator's issued certificates: search,
// review (PDF in a side panel, rendered on demand) and download.

type Row = {
  id: string; serialNumber: string; status: string; issuedAt: string | null;
  recipientName: string; recipientIc: string | null; contingentName: string | null; stateName: string | null;
  competitionCode: string | null; competitionName: string | null; awardTitle: string | null; rank: number | null;
  eventName: string | null; templateVersion: { version: number };
};
const SOURCE_LABEL: Record<string, string> = {
  EVENT_PARTICIPANTS: "Peserta Acara", EVENT_WINNERS: "Pencapaian Acara", ALL_REGISTERED: "Semua Berdaftar", CUSTOM: "Custom",
};
const fmtIc = (ic: string | null) => {
  const d = (ic ?? "").replace(/\D/g, "");
  return d.length === 12 ? `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : ic ?? "";
};

export function GeneratorCertificatesClient({ jobId, templateName, source, eventName, initialGroupBy = "none" }: {
  jobId: string; templateName: string; source: string; eventName: string | null; initialGroupBy?: GenCertsGroupBy;
}) {
  const [groupBy, setGroupByState] = useState<GenCertsGroupBy>(initialGroupBy);
  const setGroupBy = (g: GenCertsGroupBy) => { setGroupByState(g); saveGroupCookie(g); setPage(1); };
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pageSize: number; rows: Row[]; groups?: Record<string, number> } | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [zipFormat, setZipFormat] = useState<ZipFormat>("competition");
  const zipHref = `/api/v2/organizer/certificates/generator/${jobId}/download?${new URLSearchParams({ format: zipFormat, ...(query && { q: query }) })}`;

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page), groupBy, ...(query && { q: query }) });
    fetch(`/api/v2/organizer/certificates/generator/${jobId}/certificates?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setData(j); })
      .catch(() => { if (alive) setData({ total: 0, pageSize: 50, rows: [] }); });
    return () => { alive = false; };
  }, [jobId, page, query, groupBy]);

  // Group key / heading of a row for the current grouping
  const groupOf = (r: Row): { key: string; label: string } =>
    groupBy === "state" ? { key: r.stateName ?? "", label: r.stateName ?? "Tiada negeri" }
    : groupBy === "rank" ? { key: r.rank == null ? "" : String(r.rank), label: r.rank == null ? "Tiada kedudukan" : r.awardTitle ?? `Kedudukan ${r.rank}` }
    : { key: r.competitionCode ?? "", label: r.competitionCode ? `${r.competitionCode} ${r.competitionName ?? ""}` : "Tiada pertandingan" };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex h-full">
      <div className="mx-auto min-w-0 max-w-6xl flex-1 space-y-4 p-6">
        <div>
          <Link href="/organizer/certificates/generator" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Semua penjana
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Sijil dikeluarkan</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {templateName} · {SOURCE_LABEL[source] ?? source}{eventName && ` · ${eventName}`}
            {data && <> · <b className="text-zinc-700">{data.total.toLocaleString()}</b> sijil</>}
          </p>
        </div>

        <form onSubmit={e => { e.preventDefault(); setPage(1); setQuery(q.trim()); }} className="flex items-center gap-2">
          <div className="relative w-80">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nama, IC, siri, kontinjen, pertandingan…"
              className="h-9 w-full rounded-md border bg-white pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </div>
          <button type="submit" className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-zinc-50">Cari</button>
          {query && <button type="button" onClick={() => { setQ(""); setQuery(""); setPage(1); }} className="text-xs text-zinc-500 hover:underline">Kosongkan</button>}
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Kumpulkan ikut</span>
            {GROUPS.map(g => (
              <button key={g.key} type="button" onClick={() => setGroupBy(g.key)}
                className={cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
                  groupBy === g.key ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                {g.label}
              </button>
            ))}
          </div>
        </form>

        {/* Bulk download: the certificates matching the current search, as one ZIP */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs shadow-sm">
          <span className="font-medium text-zinc-700">Muat turun ZIP</span>
          {ZIP_FORMATS.map(f => (
            <button key={f.key} type="button" onClick={() => setZipFormat(f.key)} title={f.hint}
              className={cn("rounded-md border px-2.5 py-1 font-medium transition-colors",
                zipFormat === f.key ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
              {f.label}
            </button>
          ))}
          <span className="text-zinc-400">
            {ZIP_FORMATS.find(f => f.key === zipFormat)!.hint}
            {zipFormat === "single" && " Fail besar — setiap PDF membawa latar templat sendiri."}
            {" "}Sijil dibatalkan tidak disertakan{query && <> · hanya hasil carian &ldquo;{query}&rdquo;</>}.
          </span>
          <a href={zipHref} download
            className={cn("ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#085782] px-3 py-1.5 font-medium text-white hover:opacity-90",
              !data?.total && "pointer-events-none opacity-40")}>
            <Download className="h-3.5 w-3.5" /> Muat turun{data ? ` (${data.total.toLocaleString()})` : ""}
          </a>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50/80 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2.5">Siri</th>
                <th className="px-3 py-2.5">Penerima</th>
                <th className="px-3 py-2.5">Kontinjen</th>
                <th className="px-3 py-2.5">Pertandingan / Anugerah</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-28 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {!data ? (
                <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" /></td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-xs text-zinc-400">Tiada sijil{query && ` untuk "${query}"`}.</td></tr>
              ) : data.rows.map((r, i) => {
                const g = groupBy === "none" ? null : groupOf(r);
                const showHeading = !!g && (i === 0 || groupOf(data.rows[i - 1]).key !== g.key);
                return (<Fragment key={r.id}>
                {showHeading && g && (
                  <tr className="bg-zinc-50">
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-zinc-700">
                      {g.label}
                      <span className="ml-2 font-normal text-zinc-400">{(data.groups?.[g.key] ?? 0).toLocaleString()} sijil</span>
                    </td>
                  </tr>
                )}
                <tr className={cn("hover:bg-sky-50/50", preview?.id === r.id && "bg-sky-50")}>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600">{r.serialNumber}<span className="ml-1 text-zinc-300">v{r.templateVersion.version}</span></td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-900">{r.recipientName || <span className="italic text-zinc-400">Sijil kosong (pra-acara)</span>}</p>
                    <p className="font-mono text-[11px] text-zinc-400">{fmtIc(r.recipientIc)}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{r.contingentName}<p className="text-[11px] text-zinc-400">{r.stateName}</p></td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    <span className="font-mono text-zinc-400">{r.competitionCode}</span> {r.competitionName}
                    {r.awardTitle && <p className="text-[11px] font-semibold text-violet-700">{r.awardTitle}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      r.status === "READY" ? "bg-emerald-50 text-emerald-700" : r.status === "REVOKED" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-600")}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setPreview(r)} title="Semak"
                        className="rounded border p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"><Eye className="h-3.5 w-3.5" /></button>
                      <a href={`/api/v2/certificates/${r.id}/download`} title="Muat turun PDF"
                        className="rounded border p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"><Download className="h-3.5 w-3.5" /></a>
                    </div>
                  </td>
                </tr>
                </Fragment>);
              })}
            </tbody>
          </table>
        </div>

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-end gap-2 text-xs text-zinc-600">
            <span>Halaman {page} / {pages}</span>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border bg-white px-2.5 py-1 disabled:opacity-40">‹ Sebelum</button>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded border bg-white px-2.5 py-1 disabled:opacity-40">Seterusnya ›</button>
          </div>
        )}
      </div>

      {/* Review panel: the real PDF, rendered on demand */}
      {preview && (
        <aside className="sticky top-0 flex h-[calc(100vh-4rem)] w-[460px] shrink-0 flex-col border-l bg-white">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">{preview.recipientName || "Sijil kosong (pra-acara)"}</p>
              <p className="font-mono text-[11px] text-zinc-400">{preview.serialNumber}</p>
            </div>
            <a href={`/api/v2/certificates/${preview.id}/download`} className="inline-flex items-center gap-1 rounded-md bg-[#085782] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90">
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            <button onClick={() => setPreview(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
          </div>
          <iframe key={preview.id} src={`/api/v2/certificates/${preview.id}/download?inline=1#toolbar=0&view=FitH`} title="Pratonton sijil" className="flex-1" />
        </aside>
      )}
    </div>
  );
}
