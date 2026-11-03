"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Award, Download, Globe, Loader2, Search, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Manager portal → Certificates. One row per participant of the manager's
// contingent(s); certificates sit under the level their generator distributed
// them to (Peringkat Sekolah / Negeri / Kebangsaan). Green = Penyertaan,
// purple = Pencapaian. A certificate opens its PDF; "Download All" merges a
// participant's certificates into one PDF.

type Level = "SCHOOL" | "STATE" | "NATIONAL";
type Cert = { id: string; serialNumber: string; level: Level; kind: "PARTICIPATION" | "ACHIEVEMENT"; label: string; online: boolean };
type Row = {
  id: string; name: string; gender: string; age: number | null; classLabel: string | null;
  contingent: string | null; certificates: Cert[];
};

/** "Lelaki · 12 tahun · 6 Bestari" — only the parts the participant has. */
function personLine(r: Row) {
  return [
    r.gender === "MALE" ? "Lelaki" : r.gender === "FEMALE" ? "Perempuan" : null,
    r.age != null ? `${r.age} tahun` : null,
    r.classLabel,
  ].filter(Boolean).join(" · ");
}

const LEVELS: { key: Level; label: string }[] = [
  { key: "SCHOOL", label: "Peringkat Sekolah" },
  { key: "STATE", label: "Peringkat Negeri" },
  { key: "NATIONAL", label: "Peringkat Kebangsaan" },
];

/** Sky-blue globe badge on the icon's corner: certificate of an online event. */
function OnlineBadge({ small }: { small?: boolean }) {
  return (
    <span className={cn("absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full border-2 border-white bg-sky-500 shadow dark:border-zinc-900",
      small ? "h-4 w-4" : "h-5 w-5")}>
      <Globe className={cn("text-white", small ? "h-2.5 w-2.5" : "h-3 w-3")} strokeWidth={2.5} />
    </span>
  );
}

function CertIcon({ kind, online, className, small }: { kind: Cert["kind"]; online?: boolean; className?: string; small?: boolean }) {
  const achievement = kind === "ACHIEVEMENT";
  return (
    <span className={cn("relative inline-flex h-11 w-9 flex-col items-center justify-center rounded-[3px] border-2 shadow-sm",
      achievement ? "border-violet-300 bg-gradient-to-b from-violet-500 to-violet-700" : "border-emerald-300 bg-gradient-to-b from-emerald-500 to-emerald-700", className)}>
      <span className="absolute inset-x-1 top-1 h-[3px] rounded bg-white/70" />
      <Award className="h-4 w-4 text-white" strokeWidth={2} />
      <span className="absolute inset-x-1.5 bottom-1.5 h-[3px] rounded bg-white/60" />
      {online && <OnlineBadge small={small} />}
    </span>
  );
}

export function ManagerCertificatesClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [onlyWith, setOnlyWith] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/manager/certificates", { cache: "no-store" })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setErr(j.error ?? `HTTP ${r.status}`); setRows([]); return; }
        setEnabled(j.enabled); setRows(j.participants);
      })
      .catch(() => { if (alive) { setErr("Gagal memuatkan sijil"); setRows([]); } });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter(r => (!term || r.name.toLowerCase().includes(term)) && (!onlyWith || r.certificates.length > 0));
  }, [rows, q, onlyWith]);
  const total = (rows ?? []).reduce((s, r) => s + r.certificates.length, 0);

  async function downloadAll(r: Row) {
    setDownloading(r.id); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/certificates/${r.id}/pdf`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `Sijil_${r.name.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Muat turun gagal"); }
    finally { setDownloading(null); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Sijil</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Sijil penyertaan dan pencapaian peserta kontinjen anda.</p>
      </div>

      {rows === null ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      ) : !enabled ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="rounded-full bg-amber-50 p-4 dark:bg-amber-950/30"><Award className="h-8 w-8 text-amber-500" strokeWidth={1.5} /></div>
          <h2 className="text-base font-semibold dark:text-zinc-100">Sijil belum diedarkan</h2>
          <p className="max-w-sm text-sm text-zinc-500">Sijil akan dipaparkan di sini setelah penganjur mengedarkannya. Sila semak semula kemudian.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama peserta…"
                className="h-9 w-full rounded-md border bg-white pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-zinc-700 dark:bg-zinc-900" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" checked={onlyWith} onChange={e => setOnlyWith(e.target.checked)} /> Peserta yang mempunyai sijil sahaja
            </label>
            <span className="ml-auto text-xs text-zinc-500">{total.toLocaleString()} sijil · {(rows ?? []).filter(r => r.certificates.length).length.toLocaleString()} peserta</span>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  <th className="w-10 px-3 py-3 text-left">#</th>
                  <th className="px-3 py-3 text-left">Nama</th>
                  {LEVELS.map(l => <th key={l.key} className="w-44 px-3 py-3 text-center">{l.label}</th>)}
                  <th className="w-40 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-zinc-800">
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-zinc-400">Tiada peserta.</td></tr>
                )}
                {shown.map((r, i) => (
                  <tr key={r.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="px-3 py-2.5 text-xs text-zinc-400">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/manager/participants/${r.id}`} className="font-medium text-zinc-900 hover:text-blue-600 hover:underline dark:text-zinc-100">{r.name}</Link>
                      <p className="text-[11px] text-zinc-500">{personLine(r)}</p>
                    </td>
                    {LEVELS.map(l => (
                      <td key={l.key} className="px-3 py-2.5">
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {r.certificates.filter(c => c.level === l.key).map(c => (
                            <a key={c.id} href={`/api/v2/certificates/${c.id}/download`}
                              title={`${c.kind === "ACHIEVEMENT" ? "Pencapaian" : "Penyertaan"}${c.online ? " (Dalam Talian)" : ""} — ${c.label}\n${c.serialNumber}`}
                              className="transition-transform hover:-translate-y-0.5">
                              <CertIcon kind={c.kind} online={c.online} />
                            </a>
                          ))}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      {r.certificates.length > 0 && (
                        <button onClick={() => downloadAll(r)} disabled={downloading !== null}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                          {downloading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Muat turun semua{r.certificates.length > 1 ? ` (${r.certificates.length})` : ""}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs italic text-zinc-500">
            <span className="flex items-center gap-2"><CertIcon kind="PARTICIPATION" className="h-8 w-7" /> Penyertaan</span>
            <span className="flex items-center gap-2"><CertIcon kind="ACHIEVEMENT" className="h-8 w-7" /> Pencapaian</span>
            <span className="flex items-center gap-2"><CertIcon kind="PARTICIPATION" online small className="h-8 w-7" /> Acara dalam talian</span>
            <span className="flex items-center gap-1.5 not-italic"><Info className="h-3.5 w-3.5" /> Klik ikon sijil untuk memuat turun PDF.</span>
          </div>
        </>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
