"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Award, BarChart3, BookOpen, CheckCircle2, Circle, CircleDashed, ClipboardCheck, ClipboardList,
  FileBadge, Gavel, Globe2, LayoutDashboard, ListChecks, Loader2, Medal, Megaphone, Minus, RefreshCw, Search, Swords,
  Trophy, UserCheck, UserPlus, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistRow, EventChecklist, StepState } from "@/lib/eventChecklist";

// Senarai Semak Pertandingan: one row per competition with its steps from
// registration to certificates, the event-wide set-up, and the pages that do
// each job. Refreshes every 30 s; everything here links to where it is managed.

const REFRESH_MS = 30_000;
const ONLINE_SCOPES = ["ONLINE_NATIONAL", "ONLINE_STATE", "ONLINE_ZONE", "ONLINE_OPEN"];

/** Matrix columns, by step key; a row without a step shows "—". */
const COLUMNS: { key: string; label: string; title: string }[] = [
  { key: "reg", label: "Daftar", title: "Pendaftaran: berdaftar · diterima" },
  { key: "att", label: "Hadir", title: "Kehadiran pasukan diterima" },
  { key: "setup", label: "Persediaan", title: "Templat penilaian / konfigurasi duel" },
  { key: "tasks", label: "Hakim / Cabutan", title: "Pautan hakim aktif / cabutan duel disahkan" },
  { key: "scoring", label: "Penilaian", title: "Pasukan dinilai dalam setiap pautan / perlawanan selesai" },
  { key: "complete", label: "Selesai", title: "Penghakiman diumumkan selesai" },
  { key: "verify", label: "Disahkan", title: "Keputusan disahkan Super Admin" },
  { key: "announce", label: "Diumumkan", title: "Dibacakan oleh MC" },
  { key: "cert", label: "Sijil", title: "Sijil dijana untuk pertandingan" },
];

const STATE_STYLE: Record<StepState, { icon: React.ElementType; cls: string; label: string }> = {
  done:    { icon: CheckCircle2, cls: "text-emerald-600", label: "Selesai" },
  partial: { icon: CircleDashed, cls: "text-amber-500",   label: "Sebahagian" },
  todo:    { icon: Circle,       cls: "text-zinc-300",    label: "Belum" },
  na:      { icon: Minus,        cls: "text-zinc-300",    label: "Tidak berkaitan" },
};

type Filter = "all" | "open" | "done";
type Kind = "all" | "Skor" | "Duel" | "Walk-in";

export function EventChecklistClient({ initial }: { initial: EventChecklist }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(() => new Date());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<Kind>("all");
  const base = `/organizer/events/${data.event.slug}/manage`;
  const href = (h: string) => (h.startsWith("/") ? h : `${base}/${h}`);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${data.event.id}/checklist`, { cache: "no-store" });
      if (res.ok) { setData(await res.json()); setUpdated(new Date()); }
    } finally { setLoading(false); }
  }, [data.event.id]);

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.rows.filter(r =>
      (kind === "all" || r.method === kind)
      && (filter === "all" || (filter === "done" ? r.percent === 100 : r.percent < 100))
      && (!s || `${r.code} ${r.name} ${r.pic ?? ""}`.toLowerCase().includes(s)));
  }, [data.rows, q, filter, kind]);

  const t = data.totals;
  const all = t.competitions + t.walkin;
  const kinds = (["Skor", "Duel", "Walk-in"] as const).filter(k => data.rows.some(r => r.method === k));
  const online = ONLINE_SCOPES.includes(data.event.scope);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Link href={base} className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900"><ListChecks className="h-5 w-5 text-indigo-600" /> Senarai Semak Pertandingan</h1>
          <p className="text-sm text-zinc-500">{data.event.name}</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {updated.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
        </button>
      </div>

      {/* Overall progress */}
      <section className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-[auto_1fr]">
        <ProgressRing percent={t.percent} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Pertandingan" value={t.competitions} sub={t.walkin ? `+ ${t.walkin} walk-in` : undefined} />
          <Tile label="Selesai dinilai" value={t.complete} of={all} />
          <Tile label="Disahkan" value={t.verified} of={all} />
          <Tile label="Diumumkan" value={t.announced} of={all} />
          <Tile label="Lengkap 100%" value={data.rows.filter(r => r.percent === 100).length} of={all} />
        </div>
      </section>

      {/* Event-wide set-up */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700">Persediaan acara</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.eventChecks.map(c => {
            const st = STATE_STYLE[c.state];
            return (
              <Link key={c.key} href={href(c.href)}
                className="group flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-indigo-200">
                <st.icon className={cn("mt-0.5 h-4 w-4 shrink-0", st.cls)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-800 group-hover:text-indigo-700">{c.label}</span>
                  <span className="block truncate text-xs text-zinc-500">{c.detail}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Per competition */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-zinc-700">Kemajuan setiap pertandingan</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kod, nama atau PIC…"
              className="w-56 rounded-lg border py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <Seg value={filter} onChange={setFilter} options={[["all", "Semua"], ["open", "Belum lengkap"], ["done", "Lengkap"]]} />
          {kinds.length > 1 && <Seg value={kind} onChange={setKind} options={[["all", "Semua jenis"], ...kinds.map(k => [k, k] as [Kind, string])]} />}
        </div>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-zinc-50 text-[11px] text-zinc-500">
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left font-semibold">Pertandingan</th>
                {COLUMNS.map(c => <th key={c.key} title={c.title} className="px-2 py-2 text-left font-semibold">{c.label}</th>)}
                <th className="px-3 py-2 text-left font-semibold">Kemajuan</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-sm text-zinc-400">Tiada pertandingan sepadan.</td></tr>
              )}
              {rows.map(r => <Row key={`${r.kind}-${r.id}`} r={r} href={href} />)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 text-[11px] text-zinc-500">
          {(Object.keys(STATE_STYLE) as StepState[]).map(k => {
            const st = STATE_STYLE[k];
            return <span key={k} className="flex items-center gap-1"><st.icon className={cn("h-3.5 w-3.5", st.cls)} /> {st.label}</span>;
          })}
          <span>· Klik sel untuk ke halaman berkaitan.</span>
        </div>
      </section>

      {/* Important pages */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700">Halaman penting</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {pages(online).map(p => (
            <Link key={p.href} href={href(p.href)}
              className="group flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-indigo-200">
              <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-800 group-hover:text-indigo-700">{p.label}</span>
                <span className="block text-xs text-zinc-500">{p.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ r, href }: { r: ChecklistRow; href: (h: string) => string }) {
  const byKey = new Map(r.steps.map(s => [s.key, s]));
  return (
    <tr className="align-top hover:bg-zinc-50/60">
      <td className="sticky left-0 z-10 max-w-[18rem] bg-white px-3 py-2">
        <p className="font-semibold text-zinc-900">
          <span className="text-indigo-600">{r.code}</span> {r.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
          <span className={cn("rounded px-1.5 py-px font-semibold",
            r.method === "Duel" ? "bg-rose-50 text-rose-700" : r.method === "Walk-in" ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700")}>{r.method}</span>
          <span>{r.participation === "INDIVIDUAL" ? "Individu" : "Pasukan"}</span>
          <span>· {r.resultScope}</span>
          {r.isSplit && <span className="rounded bg-violet-50 px-1.5 py-px text-violet-700">Pecahan</span>}
          <span className={cn(!r.pic && !r.isSplit && "text-amber-600")}>· PIC: {r.pic || (r.isSplit ? "induk" : "tiada")}</span>
        </p>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[10px]">
          {r.links.map(l => <Link key={l.href + l.label} href={href(l.href)} className="text-indigo-600 hover:underline">{l.label}</Link>)}
        </p>
      </td>
      {COLUMNS.map(c => {
        const s = byKey.get(c.key);
        if (!s) return <td key={c.key} className="px-2 py-2 text-zinc-300">—</td>;
        const st = STATE_STYLE[s.state];
        const body = (
          <span className="flex items-start gap-1">
            <st.icon className={cn("mt-px h-3.5 w-3.5 shrink-0", st.cls)} />
            <span className={cn("leading-snug", s.state === "na" ? "text-zinc-400" : "text-zinc-600")}>{s.detail}</span>
          </span>
        );
        return (
          <td key={c.key} className="px-2 py-2" title={`${s.label}: ${st.label}`}>
            {s.href && s.state !== "na" ? <Link href={href(s.href)} className="block rounded hover:bg-indigo-50">{body}</Link> : body}
          </td>
        );
      })}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
            <div className={cn("h-full rounded-full", r.percent === 100 ? "bg-emerald-500" : r.percent >= 50 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${r.percent}%` }} />
          </div>
          <span className="w-8 text-right font-mono font-semibold text-zinc-700">{r.percent}%</span>
        </div>
      </td>
    </tr>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={percent === 100 ? "#10b981" : "#6366f1"} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * c} ${c}`} />
      </svg>
      <div>
        <p className="text-3xl font-bold tabular-nums text-zinc-900">{percent}%</p>
        <p className="text-xs text-zinc-500">kelengkapan keseluruhan</p>
      </div>
    </div>
  );
}

function Tile({ label, value, of, sub }: { label: string; value: number; of?: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="text-xl font-bold tabular-nums text-zinc-900">{value}{of !== undefined && <span className="text-sm font-medium text-zinc-400">/{of}</span>}</p>
      {sub && <p className="text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium", value === k ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-100")}>{l}</button>
      ))}
    </div>
  );
}

/** Pages that run an event, in the order they are used. */
function pages(online: boolean): { label: string; desc: string; href: string; icon: React.ElementType }[] {
  return [
    { label: "Pertandingan & PIC", desc: "Tambah pertandingan, had pasukan, PIC dan akses portal.", href: "/organizer/events", icon: Trophy },
    { label: "Pra-Pendaftaran", desc: "Sahkan penyertaan, wildcard dan pasukan prasyarat.", href: "preregistration", icon: ClipboardList },
    { label: "Penyertaan Antarabangsa", desc: "Sekolah, peserta dan pasukan luar negara.", href: "international", icon: Globe2 },
    ...(online ? [] : [
      { label: "Pendaftaran Disahkan", desc: "Pasukan diterima dan status kehadiran.", href: "attendance/confirmed", icon: ClipboardCheck },
      { label: "Log Kehadiran", desc: "Pautan kaunter kehadiran hari acara.", href: "attendance", icon: Users },
      { label: "Dashboard Kehadiran", desc: "Statistik kehadiran secara langsung.", href: "attendance/dashboard", icon: LayoutDashboard },
      { label: "Kehadiran Individu", desc: "Kehadiran setiap peserta.", href: "attendance/individual", icon: UserCheck },
    ]),
    { label: "Penghakiman", desc: "Templat, pautan hakim, status selesai dan pengesahan.", href: "judging", icon: Gavel },
    { label: "Scoreboard & Duel", desc: "Cabutan, kawalan arena dan paparan awam duel.", href: "scoreboard", icon: Swords },
    { label: "Anugerah Tambahan", desc: "Anugerah selain tempat utama.", href: "awards", icon: Award },
    { label: "Keputusan", desc: "Kedudukan dan paparan keputusan awam.", href: "results", icon: Trophy },
    { label: "Medal Tally", desc: "Kutipan pingat mengikut negeri.", href: "results/medals", icon: Medal },
    { label: "Pengumuman", desc: "Senarai pengumuman dan papan MC.", href: "announcements", icon: Megaphone },
    { label: "Walk-in", desc: "Pendaftaran, penghakiman dan keputusan walk-in.", href: "walkin", icon: UserPlus },
    { label: "Sijil", desc: "Templat, penjanaan dan muat turun sijil.", href: "/organizer/certificates", icon: FileBadge },
    { label: "Laporan", desc: "Statistik penyertaan dan prestasi.", href: "reports", icon: BarChart3 },
    { label: "Manual Pengguna", desc: "Langkah penghakiman hingga pengumuman.", href: "manual", icon: BookOpen },
  ];
}

