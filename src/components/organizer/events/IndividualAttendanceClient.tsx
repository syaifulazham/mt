"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserCheck, RefreshCw, Search, X, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttendanceStats, IndividualAttendance } from "@/lib/individualAttendance";

type EventInfo = { id: string; name: string; slug: string };

function fmtWhen(d: string | null) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";

function SummaryCard({ label, value, sub, tone = "zinc" }: {
  label: string; value: number; sub?: string; tone?: "zinc" | "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    zinc: "text-zinc-800", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", sky: "text-sky-700",
  };
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums mt-0.5", tones[tone])}>{value.toLocaleString("ms-MY")}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const COLS: { key: keyof AttendanceStats; label: string; title: string; cls?: string }[] = [
  { key: "contingents",            label: "Kontingen",         title: "Kontingen dengan pasukan diterima" },
  { key: "teams",                  label: "Pasukan",           title: "Pasukan diterima" },
  { key: "teamsFull",              label: "Hadir penuh",       title: "Semua ahli hadir", cls: "text-emerald-700" },
  { key: "teamsWithAbsent",        label: "Ada ahli tidak hadir", title: "Sekurang-kurangnya seorang ahli tidak hadir", cls: "text-amber-700" },
  { key: "teamsAbsent",            label: "Tidak hadir langsung", title: "Tiada seorang ahli pun hadir", cls: "text-rose-700" },
  { key: "present",                label: "Individu hadir",    title: "Kehadiran individu (ahli × pasukan)", cls: "text-emerald-700" },
  { key: "absent",                 label: "Individu tidak hadir", title: "Ahli yang tidak mendaftar hadir", cls: "text-rose-700" },
  { key: "absentWhileTeamPresent", label: "Tidak hadir, rakan hadir", title: "Tidak hadir sedangkan rakan sepasukan hadir", cls: "text-amber-700 font-semibold" },
];

export function IndividualAttendanceClient({ event, data, generatedAt }: {
  event: EventInfo; data: IndividualAttendance; generatedAt: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const t = data.total;

  const ql = q.trim().toLowerCase();
  const rows = data.absentees
    .filter(r => !state || r.stateName === state)
    .filter(r => !ql || [r.name, r.teamName, r.contingentName, r.competitionCode, r.competitionName, ...r.presentTeammates]
      .some(v => v.toLowerCase().includes(ql)));

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const head = ["Nama", "Jantina", "Kelas", "Pasukan", "Pertandingan", "Kontingen", "Negeri", "Rakan hadir", "Saiz pasukan", "Kontingen tiba"];
    const lines = rows.map(r => [
      r.name, r.gender ?? "", r.classGrade ?? "", r.teamName, `${r.competitionCode} ${r.competitionName}`,
      r.contingentName, r.stateName, r.presentTeammates.join("; "), String(r.teamSize), r.teamArrivedAt ?? "",
    ].map(esc).join(","));
    const blob = new Blob(["\ufeff" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tidak-hadir-rakan-hadir-${event.slug}${state ? `-${state}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-teal-600" />
            <h1 className="text-xl font-bold text-zinc-900">Kehadiran Individu</h1>
          </div>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>Dijana {fmtWhen(generatedAt)}</span>
          <Button size="sm" variant="outline" onClick={() => router.refresh()} className="h-7 text-xs gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Muat semula
          </Button>
        </div>
      </div>

      {data.checkIns === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Tiada rekod kehadiran individu untuk acara ini — tab &quot;Kaunter Pertandingan&quot; di kaunter kehadiran tidak digunakan.
          Semua angka di bawah menganggap setiap ahli tidak hadir.
        </p>
      ) : (
        <p className="text-[11px] text-zinc-400">
          {data.checkIns.toLocaleString("ms-MY")} imbasan individu di Kaunter Pertandingan · {fmtWhen(data.firstCheckIn)} – {fmtWhen(data.lastCheckIn)}.
          Unit kiraan ialah ahli bagi setiap pasukan diterima (peserta dalam dua pasukan dikira dua kali).
          &quot;Tidak hadir&quot; bermaksud tidak diimbas di Kaunter Pertandingan — pasukan yang langsung tiada imbasan mungkin hadir tetapi tidak melalui kaunter itu.
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Kontingen" value={t.contingents} sub={`${t.teams.toLocaleString("ms-MY")} pasukan diterima`} />
        <SummaryCard label="Pasukan hadir penuh" value={t.teamsFull} sub={`${pct(t.teamsFull, t.teams)} pasukan · ${t.teamsWithAbsent} ada ahli tidak hadir`} tone="emerald" />
        <SummaryCard label="Individu hadir" value={t.present} sub={`${pct(t.present, t.members)} daripada ${t.members.toLocaleString("ms-MY")} · ${t.absent} tidak hadir`} tone="sky" />
        <SummaryCard label="Tidak hadir, rakan sepasukan hadir" value={t.absentWhileTeamPresent} sub={`dalam ${t.teamsPartial} pasukan`} tone="amber" />
      </div>

      {/* By state */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50">
          <h2 className="text-sm font-semibold text-zinc-700">Mengikut Negeri</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50/50 text-[11px] font-medium text-zinc-500">
                <th className="px-3 py-2 text-left">Negeri</th>
                {COLS.map(c => <th key={c.key} title={c.title} className="px-3 py-2 text-right whitespace-nowrap">{c.label}</th>)}
                <th className="px-3 py-2 text-right" title="Individu hadir / jumlah ahli">% hadir</th>
              </tr>
            </thead>
            <tbody>
              {data.byState.map(s => (
                <tr key={s.stateName}
                  onClick={() => setState(state === s.stateName ? "" : s.stateName)}
                  title="Klik untuk menapis senarai di bawah"
                  className={cn("border-b cursor-pointer hover:bg-zinc-50", state === s.stateName && "bg-teal-50")}>
                  <td className="px-3 py-2 font-medium text-zinc-800">{s.stateName}</td>
                  {COLS.map(c => <td key={c.key} className={cn("px-3 py-2 text-right tabular-nums", c.cls)}>{s[c.key].toLocaleString("ms-MY")}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{pct(s.present, s.members)}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-semibold">
                <td className="px-3 py-2 text-zinc-800">Jumlah</td>
                {COLS.map(c => <td key={c.key} className={cn("px-3 py-2 text-right tabular-nums", c.cls)}>{t[c.key].toLocaleString("ms-MY")}</td>)}
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{pct(t.present, t.members)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Absent while teammates present */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-zinc-700">Tidak Hadir Sedangkan Rakan Sepasukan Hadir</h2>
          <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-zinc-200 text-zinc-600">{rows.length}</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, pasukan, kontingen…"
                className="w-60 pl-8 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-200" />
              {q && <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-zinc-400"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <select value={state} onChange={e => setState(e.target.value)}
              className={cn("py-1.5 pl-2 pr-7 text-xs border rounded-lg bg-white", state && "border-teal-300 text-teal-700")}>
              <option value="">Semua negeri</option>
              {data.byState.filter(s => s.absentWhileTeamPresent > 0).map(s => (
                <option key={s.stateName} value={s.stateName}>{s.stateName} · {s.absentWhileTeamPresent}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="h-7 text-xs gap-1">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-400">
            {data.absentees.length === 0 ? "Tiada ahli yang tidak hadir sedangkan rakan sepasukannya hadir." : "Tiada rekod sepadan."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50/50 text-[11px] font-medium text-zinc-500">
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Nama</th>
                  <th className="px-3 py-2 text-left w-24">Kelas</th>
                  <th className="px-3 py-2 text-left">Pasukan</th>
                  <th className="px-3 py-2 text-left">Pertandingan</th>
                  <th className="px-3 py-2 text-left">Kontingen</th>
                  <th className="px-3 py-2 text-left w-28">Negeri</th>
                  <th className="px-3 py-2 text-left">Rakan sepasukan hadir</th>
                  <th className="px-3 py-2 text-left w-36">Kontingen tiba</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.teamId}:${r.participantId}`} className="border-b last:border-0 hover:bg-zinc-50/60 align-top">
                    <td className="px-3 py-2 text-xs text-zinc-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-zinc-800">
                      {r.name}
                      {r.gender && <span className="ml-1 text-[10px] text-zinc-400">{r.gender === "MALE" ? "L" : r.gender === "FEMALE" ? "P" : ""}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{r.classGrade ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-700">{r.teamName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600"><span className="font-mono text-zinc-400 mr-1">{r.competitionCode}</span>{r.competitionName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{r.contingentName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{r.stateName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      <span className="text-emerald-700 font-medium">{r.presentTeammates.length}/{r.teamSize - 1}</span>
                      <span className="ml-1">{r.presentTeammates.join(", ")}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-500">{fmtWhen(r.teamArrivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
