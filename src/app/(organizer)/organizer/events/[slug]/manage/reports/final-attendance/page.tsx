import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Footprints, Globe, MapPin, Users } from "lucide-react";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { PrintButton } from "@/components/organizer/events/PrintButton";
import { db } from "@/lib/db";
import {
  computeFinalAttendanceData, type AttendanceBasis, type Count, type DimRow, type MatrixData, type ModeReport,
} from "@/lib/reports/finalAttendanceData";

export const metadata: Metadata = { title: "Laporan Kehadiran Akhir" };
export const dynamic = "force-dynamic";

// ── helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString("en-MY");
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–");
const fmtDate = (d: Date) => d.toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });

type Theme = { band: string; sub: string; bar: string; soft: string; text: string; ring: string };
const THEMES: Record<ModeReport["mode"], Theme> = {
  BERSEMUKA: { band: "bg-emerald-800", sub: "text-emerald-200", bar: "bg-emerald-600", soft: "bg-emerald-50", text: "text-emerald-700", ring: "border-emerald-200" },
  WALKIN:    { band: "bg-amber-700",   sub: "text-amber-100",   bar: "bg-amber-500",   soft: "bg-amber-50",   text: "text-amber-700",   ring: "border-amber-200" },
  ONLINE:    { band: "bg-sky-800",     sub: "text-sky-200",     bar: "bg-sky-600",     soft: "bg-sky-50",     text: "text-sky-700",     ring: "border-sky-200" },
};

const TH = "px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b";
const TD = "px-2.5 py-1.5 text-xs text-slate-700";
const NUM = "px-2.5 py-1.5 text-xs text-right font-mono tabular-nums text-slate-900";

function Panel({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-sm break-inside-avoid ${className}`}>
      <header className="border-b px-4 py-2.5">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{title}</h3>
        {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: total ? `${(value / total) * 100}%` : "0%" }} />
    </div>
  );
}

function Kpi({ label, count, attendance, theme }: { label: string; count: Count; attendance: boolean; theme: Theme }) {
  return (
    <div className={`rounded-lg border ${theme.ring} bg-white p-3`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{fmt(count.present)}</p>
      {attendance ? (
        <>
          <p className="text-[11px] text-slate-500">daripada {fmt(count.reg)} berdaftar · <span className={`font-semibold ${theme.text}`}>{pct(count.present, count.reg)}</span></p>
          <div className="mt-1.5"><Bar value={count.present} total={count.reg} color={theme.bar} /></div>
        </>
      ) : <p className="text-[11px] text-slate-500">penyertaan sah</p>}
    </div>
  );
}

/** A breakdown: Berdaftar / Hadir / % kehadiran (when attendance is taken), L / P and share of the total. */
function DimTable({ rows, attendance, total, theme, label }: {
  rows: DimRow[]; attendance: boolean; total: number; theme: Theme; label: string;
}) {
  const sum = rows.reduce((a, r) => ({ reg: a.reg + r.reg, present: a.present + r.present, male: a.male + r.male, female: a.female + r.female }), { reg: 0, present: 0, male: 0, female: 0 });
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className={`${TH} text-left`}>{label}</th>
          {attendance && <th className={`${TH} text-right`}>Berdaftar</th>}
          <th className={`${TH} text-right`}>{attendance ? "Hadir" : "Peserta"}</th>
          {attendance && <th className={`${TH} text-right`}>% Hadir</th>}
          <th className={`${TH} text-right`}>L</th>
          <th className={`${TH} text-right`}>P</th>
          <th className={`${TH} w-32 text-left`}>Peratus</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key} className={i % 2 ? "bg-slate-50/60" : ""}>
            <td className={TD}>{r.label}</td>
            {attendance && <td className={NUM}>{fmt(r.reg)}</td>}
            <td className={`${NUM} font-bold`}>{fmt(r.present)}</td>
            {attendance && <td className={`${NUM} ${theme.text}`}>{pct(r.present, r.reg)}</td>}
            <td className={NUM}>{fmt(r.male)}</td>
            <td className={NUM}>{fmt(r.female)}</td>
            <td className="px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1"><Bar value={r.present} total={total} color={theme.bar} /></div>
                <span className="w-11 text-right text-[10px] tabular-nums text-slate-500">{pct(r.present, total)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t bg-slate-50 font-semibold">
          <td className={`${TD} font-bold`}>Jumlah</td>
          {attendance && <td className={NUM}>{fmt(sum.reg)}</td>}
          <td className={`${NUM} font-bold`}>{fmt(sum.present)}</td>
          {attendance && <td className={`${NUM} ${theme.text}`}>{pct(sum.present, sum.reg)}</td>}
          <td className={NUM}>{fmt(sum.male)}</td>
          <td className={NUM}>{fmt(sum.female)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function Matrix({ data, theme }: { data: MatrixData; theme: Theme }) {
  if (!data.rows.length) return <p className="px-4 py-6 text-center text-xs text-slate-400">Tiada data.</p>;
  const colTotal = (c: string) => data.rows.reduce((a, r) => a + (data.cells[r.key]?.[c] ?? 0), 0);
  const rowTotal = (r: string) => data.cols.reduce((a, c) => a + (data.cells[r]?.[c.key] ?? 0), 0);
  const max = Math.max(1, ...data.rows.flatMap(r => data.cols.map(c => data.cells[r.key]?.[c.key] ?? 0)));
  const grand = data.rows.reduce((a, r) => a + rowTotal(r.key), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${TH} text-left`}>Kumpulan sasaran</th>
            {data.cols.map(c => <th key={c.key} className={`${TH} text-right`}>{c.label}</th>)}
            <th className={`${TH} text-right`}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.key} className="border-b last:border-0">
              <td className={TD}>{r.label}</td>
              {data.cols.map(c => {
                const v = data.cells[r.key]?.[c.key] ?? 0;
                return (
                  <td key={c.key} className={NUM} style={v ? { backgroundColor: `color-mix(in srgb, currentColor ${Math.round((v / max) * 18)}%, transparent)` } : undefined}>
                    <span className={v ? theme.text : "text-slate-300"}>{v ? fmt(v) : "–"}</span>
                  </td>
                );
              })}
              <td className={`${NUM} font-bold`}>{fmt(rowTotal(r.key))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-slate-50">
            <td className={`${TD} font-bold`}>Jumlah</td>
            {data.cols.map(c => <td key={c.key} className={`${NUM} font-bold`}>{fmt(colTotal(c.key))}</td>)}
            <td className={`${NUM} font-bold`}>{fmt(grand)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td className={`${TD} text-slate-400`}>Peratus</td>
            {data.cols.map(c => <td key={c.key} className={`${NUM} text-slate-500`}>{pct(colTotal(c.key), grand)}</td>)}
            <td className={`${NUM} text-slate-500`}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CountCells({ c, attendance, theme }: { c: Count; attendance: boolean; theme: Theme }) {
  return attendance ? (
    <>
      <td className={NUM}>{fmt(c.reg)}</td>
      <td className={`${NUM} font-bold`}>{fmt(c.present)}</td>
      <td className={`${NUM} ${theme.text}`}>{pct(c.present, c.reg)}</td>
    </>
  ) : <td className={`${NUM} font-bold`}>{fmt(c.present)}</td>;
}

function CountHeads({ label, attendance }: { label: string; attendance: boolean }) {
  return attendance ? (
    <>
      <th className={`${TH} text-right`}>{label} daftar</th>
      <th className={`${TH} text-right`}>{label} hadir</th>
      <th className={`${TH} text-right`}>%</th>
    </>
  ) : <th className={`${TH} text-right`}>{label}</th>;
}

const MODE_TITLE: Record<ModeReport["mode"], string> = {
  BERSEMUKA: "Pertandingan Bersemuka", WALKIN: "Pertandingan Walk-in (Bersemuka)", ONLINE: "Pertandingan Dalam Talian",
};
const MODE_SHORT: Record<ModeReport["mode"], string> = { BERSEMUKA: "Bersemuka", WALKIN: "Walk-in", ONLINE: "Dalam talian" };
const MODE_ICON = { BERSEMUKA: MapPin, WALKIN: Footprints, ONLINE: Globe } as const;

function ModeSection({ r, index, basis }: { r: ModeReport; index: number; basis: AttendanceBasis }) {
  const theme = THEMES[r.mode];
  const att = r.attendanceTaken;
  const total = r.participants.present;
  const title = MODE_TITLE[r.mode];
  const Icon = MODE_ICON[r.mode];
  const basisNote = r.mode === "BERSEMUKA"
    ? basis === "individual"
      ? "Kehadiran Individu: peserta hadir apabila didaftar masuk di tapak pertandingan; pasukan hadir apabila sekurang-kurangnya seorang ahli hadir (sama seperti Dashboard Kehadiran, mod Individu)."
      : "Kehadiran kaunter: pasukan dan semua ahlinya hadir apabila kontinjen mendaftar masuk di kaunter utama (sama seperti Dashboard Kehadiran, mod Kaunter)."
    : r.mode === "WALKIN"
      ? "Pendaftaran walk-in di tapak; dikira hadir apabila disahkan. Tidak termasuk dalam Dashboard Kehadiran."
      : "Kehadiran tidak diambil bagi pertandingan dalam talian — angka ialah penyertaan pasukan yang diterima.";

  if (!r.competitions) {
    return (
      <section className="space-y-4">
        <div className={`${theme.band} rounded-lg px-5 py-4 text-white`}>
          <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${theme.sub}`}>Bahagian {index}</p>
          <h2 className="flex items-center gap-2 text-lg font-black uppercase"><Icon className="h-5 w-5" />{title}</h2>
        </div>
        <p className="rounded-lg border bg-white px-5 py-8 text-center text-sm text-slate-400">Tiada pertandingan dalam kategori ini.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 print:break-before-page">
      <div className={`${theme.band} rounded-lg px-5 py-4 text-white`}>
        <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${theme.sub}`}>Bahagian {index}</p>
        <h2 className="flex items-center gap-2 text-lg font-black uppercase"><Icon className="h-5 w-5" />{title}</h2>
        <p className={`mt-1 text-xs ${theme.sub}`}>
          {r.competitions} pertandingan ·{" "}
          {basisNote}
        </p>
      </div>

      {/* A. Ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Peserta" count={r.participants} attendance={att} theme={theme} />
        <Kpi label="Kontinjen" count={r.contingents} attendance={att} theme={theme} />
        <Kpi label="Pasukan / penyertaan" count={r.teams} attendance={att} theme={theme} />
        <Kpi label="Jurulatih" count={r.trainers} attendance={att} theme={theme} />
      </div>

      {/* B. Profil peserta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Jantina" note={att ? "Peserta hadir" : "Peserta"}>
          <div className="space-y-3 p-4">
            {[["Lelaki", r.male, "bg-blue-500"], ["Perempuan", r.female, "bg-pink-500"]].map(([l, v, c]) => (
              <div key={l as string}>
                <div className="flex justify-between text-xs"><span className="font-medium text-slate-600">{l}</span>
                  <span className="font-mono tabular-nums text-slate-900">{fmt(v as number)} <span className="text-slate-400">({pct(v as number, total)})</span></span></div>
                <div className="mt-1"><Bar value={v as number} total={total} color={c as string} /></div>
              </div>
            ))}
            <div className="flex h-3 overflow-hidden rounded-full">
              <div className="bg-blue-500" style={{ width: total ? `${(r.male / total) * 100}%` : "0%" }} />
              <div className="bg-pink-500" style={{ width: total ? `${(r.female / total) * 100}%` : "0%" }} />
            </div>
            <p className="text-center text-[11px] text-slate-400">Nisbah L : P = {r.female ? (r.male / r.female).toFixed(2) : "–"} : 1</p>
          </div>
        </Panel>
        <Panel title="Kumpulan sasaran" className="lg:col-span-2">
          <DimTable rows={r.byTargetGroup} attendance={att} total={total} theme={theme} label="Kumpulan sasaran" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Etnik"><DimTable rows={r.byEthnicity} attendance={att} total={total} theme={theme} label="Etnik" /></Panel>
        <Panel title="Lokaliti kontinjen" note="Mengikut lokaliti sekolah / institusi kontinjen">
          <DimTable rows={r.byLocality} attendance={att} total={total} theme={theme} label="Lokaliti" />
        </Panel>
      </div>

      <Panel title="Darjah / Tingkatan" note="Mengikut tahap pendidikan peserta; tahap Belia dikumpulkan daripada maklumat yang diisi">
        <div className="grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {r.byGrade.map(g => (
            <div key={g.level}>
              <p className={`px-3 py-1.5 text-[11px] font-bold uppercase ${theme.text} ${theme.soft}`}>{g.level}</p>
              <DimTable rows={g.rows} attendance={att} total={total} theme={theme} label="Darjah / Tingkatan" />
            </div>
          ))}
        </div>
      </Panel>

      {/* C. Silang */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Kumpulan sasaran × Etnik" note={att ? "Peserta hadir" : "Peserta"}><Matrix data={r.tgByEthnicity} theme={theme} /></Panel>
        <Panel title="Kumpulan sasaran × Lokaliti" note={att ? "Peserta hadir" : "Peserta"}><Matrix data={r.tgByLocality} theme={theme} /></Panel>
      </div>

      {/* D. Negeri */}
      <Panel title="Mengikut negeri">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${TH} w-8 text-right`}>#</th>
                <th className={`${TH} text-left`}>Negeri</th>
                <CountHeads label="Kontinjen" attendance={att} />
                <CountHeads label="Pasukan" attendance={att} />
                <CountHeads label="Peserta" attendance={att} />
                <th className={`${TH} text-right`}>L</th>
                <th className={`${TH} text-right`}>P</th>
              </tr>
            </thead>
            <tbody>
              {r.byState.map((s, i) => (
                <tr key={s.stateName} className={i % 2 ? "bg-slate-50/60" : ""}>
                  <td className={`${NUM} text-slate-400`}>{i + 1}</td>
                  <td className={TD}>{s.stateName}</td>
                  <CountCells c={s.contingents} attendance={att} theme={theme} />
                  <CountCells c={s.teams} attendance={att} theme={theme} />
                  <CountCells c={s.participants} attendance={att} theme={theme} />
                  <td className={NUM}>{fmt(s.male)}</td>
                  <td className={NUM}>{fmt(s.female)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* E. Pertandingan */}
      <Panel title="Mengikut pertandingan">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Kod</th>
                <th className={`${TH} text-left`}>Pertandingan</th>
                <th className={`${TH} text-left`}>Kumpulan sasaran</th>
                <CountHeads label="Pasukan" attendance={att} />
                <CountHeads label="Peserta" attendance={att} />
                <th className={`${TH} text-right`}>L</th>
                <th className={`${TH} text-right`}>P</th>
              </tr>
            </thead>
            <tbody>
              {r.byCompetition.map((c, i) => (
                <tr key={`${c.walkIn}:${c.code}:${i}`} className={i % 2 ? "bg-slate-50/60" : ""}>
                  <td className={`${TD} font-mono text-slate-500`}>{c.code}</td>
                  <td className={TD}>
                    {c.name}
                    {c.walkIn && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">Walk-in</span>}
                  </td>
                  <td className={`${TD} text-slate-500`}>{c.targetGroup}</td>
                  <CountCells c={c.teams} attendance={att} theme={theme} />
                  <CountCells c={c.participants} attendance={att} theme={theme} />
                  <td className={NUM}>{fmt(c.male)}</td>
                  <td className={NUM}>{fmt(c.female)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default async function FinalAttendanceReportPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, venue: true, city: true, startDate: true, endDate: true, state: { select: { name: true } } },
  });
  if (!event) notFound();

  const basis: AttendanceBasis = (await searchParams).mode === "individual" ? "individual" : "counter";
  const d = await computeFinalAttendanceData(event.id, basis);
  if (!d) notFound();

  const venueLine = [event.venue, event.city, event.state?.name].filter(Boolean).join(" · ");
  const dateLine = event.startDate
    ? [fmtDate(event.startDate), event.endDate && fmtDate(event.endDate) !== fmtDate(event.startDate) ? fmtDate(event.endDate) : null].filter(Boolean).join(" — ")
    : null;
  const b = d.bersemuka, w = d.walkIn, o = d.online;
  const base = `/organizer/events/${slug}/manage/reports/final-attendance`;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="bg-zinc-900 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/organizer/events/${slug}/manage/reports`}
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 print:hidden">
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </Link>
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">Laporan Kehadiran Akhir</p>
            <h1 className="text-xl font-black uppercase leading-tight tracking-tight text-white md:text-2xl">{d.eventName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {venueLine && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{venueLine}</span>}
              {dateLine && <span>{dateLine}</span>}
              <span>Data setakat {new Date(d.generatedAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 print:hidden">
            <PrintButton />
            <div className="flex rounded-lg bg-zinc-800 p-0.5 text-xs font-medium">
              {([["counter", "Kaunter"], ["individual", "Individu"]] as const).map(([k, l]) => (
                <Link key={k} href={k === "counter" ? base : `${base}?mode=individual`} replace scroll={false}
                  className={`rounded-md px-3 py-1 ${basis === k ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}>
                  {l}
                </Link>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">Asas kehadiran Bersemuka</p>
          </div>
        </div>
      </div>

      <div className="min-h-screen space-y-8 bg-slate-100 px-6 py-6 print:bg-white print:px-0">
        {/* Ringkasan keseluruhan */}
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="bg-[#7B0D1E] px-5 py-3 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">Ringkasan Keseluruhan</p>
            <h2 className="text-sm font-black uppercase">Penglibatan sebenar — Bersemuka, Walk-in dan Dalam Talian</h2>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y md:grid-cols-4 md:divide-y-0">
            {[
              ["Peserta unik", d.overall.participants, d.overall.both ? `${fmt(d.overall.both)} menyertai kedua-dua kategori` : "tanpa pertindihan"],
              ["Kontinjen", d.overall.contingents, "sekurang-kurangnya satu pasukan hadir"],
              ["Pasukan / penyertaan", d.overall.teams, "termasuk walk-in"],
              ["Jurulatih", d.overall.trainers, "jurulatih pasukan yang hadir"],
            ].map(([l, v, s]) => (
              <div key={l as string} className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{fmt(v as number)}</p>
                <p className="text-[11px] text-slate-500">{s}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH} text-left`}>Kategori</th>
                  <th className={`${TH} text-right`}>Pertandingan</th>
                  <th className={`${TH} text-right`}>Kontinjen</th>
                  <th className={`${TH} text-right`}>Pasukan</th>
                  <th className={`${TH} text-right`}>Peserta berdaftar</th>
                  <th className={`${TH} text-right`}>Peserta hadir</th>
                  <th className={`${TH} text-right`}>% Hadir</th>
                  <th className={`${TH} text-right`}>L</th>
                  <th className={`${TH} text-right`}>P</th>
                  <th className={`${TH} text-right`}>Jurulatih</th>
                </tr>
              </thead>
              <tbody>
                {[b, w, o].filter(m => m.competitions).map(m => (
                  <tr key={m.mode} className="border-b last:border-0">
                    <td className={`${TD} font-semibold`}>
                      <span className={`inline-flex items-center gap-1.5 ${THEMES[m.mode].text}`}>
                        {(() => { const I = MODE_ICON[m.mode]; return <I className="h-3.5 w-3.5" />; })()}
                        {MODE_SHORT[m.mode]}
                      </span>
                    </td>
                    <td className={NUM}>{fmt(m.competitions)}</td>
                    <td className={NUM}>{fmt(m.contingents.present)}</td>
                    <td className={NUM}>{fmt(m.teams.present)}</td>
                    <td className={NUM}>{fmt(m.participants.reg)}</td>
                    <td className={`${NUM} font-bold`}>{fmt(m.participants.present)}</td>
                    <td className={`${NUM} ${THEMES[m.mode].text}`}>{m.attendanceTaken ? pct(m.participants.present, m.participants.reg) : "n/a"}</td>
                    <td className={NUM}>{fmt(m.male)}</td>
                    <td className={NUM}>{fmt(m.female)}</td>
                    <td className={NUM}>{fmt(m.trainers.present)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-start gap-1.5 border-t bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
            <Users className="mt-0.5 h-3 w-3 shrink-0" />
            Semua angka peserta ialah peserta unik. Seorang peserta yang menyertai lebih daripada satu pertandingan dikira sekali dalam setiap jadual.
            Bahagian Bersemuka sepadan dengan Dashboard Kehadiran (mod {basis === "individual" ? "Individu" : "Kaunter"}); walk-in dilaporkan berasingan.
            Laporan Akhir Program juga berdasarkan kehadiran (mod Kaunter), tetapi menyenaraikan semua peserta antarabangsa.
          </p>
        </section>

        <ModeSection r={b} index={1} basis={basis} />
        {w.competitions > 0 && <ModeSection r={w} index={2} basis={basis} />}
        <ModeSection r={o} index={w.competitions > 0 ? 3 : 2} basis={basis} />
      </div>
    </OrganizerShell>
  );
}
