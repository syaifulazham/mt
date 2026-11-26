import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, FileSpreadsheet, Info } from "lucide-react";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { PrintButton } from "@/components/organizer/events/PrintButton";
import { db } from "@/lib/db";
import {
  attendanceListNote, computeAttendanceListData, LIST_MODE_LABEL,
  type AttendanceBasis, type CompetitionGroup, type ListMode, type Tally,
} from "@/lib/reports/attendanceListData";

export const metadata: Metadata = { title: "Senarai Kehadiran Penyertaan" };
export const dynamic = "force-dynamic";

const fmt = (v: number) => (v ? v.toLocaleString("en-MY") : "–");

const TH = "border border-slate-400 px-1.5 py-1 text-[10px] font-bold uppercase leading-tight text-slate-800 bg-slate-100";
const TD = "border border-slate-300 px-1.5 py-1 text-xs text-slate-800";
const NUM = "border border-slate-300 px-1.5 py-1 text-xs text-center tabular-nums text-slate-900";

function TallyCells({ t, bold = false }: { t: Tally; bold?: boolean }) {
  const c = bold ? `${NUM} font-bold` : NUM;
  return (
    <>
      <td className={c}>{fmt(t.male)}</td>
      <td className={c}>{fmt(t.female)}</td>
      <td className={c}>{fmt(t.melayu)}</td>
      <td className={c}>{fmt(t.cina)}</td>
      <td className={c}>{fmt(t.india)}</td>
      <td className={c}>{fmt(t.lain)}</td>
      <td className={`${c} font-bold`}>{fmt(t.murid)}</td>
      <td className={`${c} font-bold`}>{fmt(t.guru)}</td>
    </>
  );
}

/** The form's two-row header: Jantina (L/P), Bangsa (4) and Jumlah (Murid/Guru). */
function TallyHead({ lead }: { lead: React.ReactNode }) {
  return (
    <thead>
      <tr>
        {lead}
        <th className={TH} colSpan={2}>Jantina</th>
        <th className={TH} colSpan={4}>Bangsa</th>
        <th className={TH} colSpan={2}>Jumlah</th>
      </tr>
      <tr>
        <th className={`${TH} w-9`}>L</th>
        <th className={`${TH} w-9`}>P</th>
        <th className={`${TH} w-14`}>Melayu</th>
        <th className={`${TH} w-12`}>Cina</th>
        <th className={`${TH} w-12`}>India</th>
        <th className={`${TH} w-12`}>Lain-lain</th>
        <th className={`${TH} w-12`}>Murid</th>
        <th className={`${TH} w-12`}>Guru</th>
      </tr>
    </thead>
  );
}

function CompetitionTable({ g, index }: { g: CompetitionGroup; index: number }) {
  return (
    <section className="break-inside-avoid-page rounded-lg border bg-white p-4 shadow-sm print:break-before-page print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-black uppercase text-slate-900">
          {index}. <span className="font-mono text-slate-500">{g.code}</span> {g.name}
          {g.walkIn && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold normal-case text-amber-700">Walk-in</span>}
        </h2>
        <p className="shrink-0 text-[11px] text-slate-500">{g.rows.length} sekolah · {g.total.murid} murid</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <TallyHead lead={<>
            <th className={`${TH} w-9`} rowSpan={2}>Bil</th>
            <th className={`${TH} w-24`} rowSpan={2}>Kod Sekolah</th>
            <th className={`${TH} text-left`} rowSpan={2}>Sekolah</th>
            <th className={`${TH} w-32`} rowSpan={2}>Negeri / Negara</th>
          </>} />
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={r.contingentId} className="break-inside-avoid">
                <td className={NUM}>{i + 1}</td>
                <td className={`${TD} font-mono text-[11px]`}>{r.schoolCode ?? "–"}</td>
                <td className={TD}>{r.name}</td>
                <td className={TD}>
                  {r.region}
                  {r.international && <span className="ml-1 rounded bg-indigo-100 px-1 text-[9px] font-semibold text-indigo-700">Antarabangsa</span>}
                </td>
                <TallyCells t={r} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className={`${TD} text-center font-black uppercase`} colSpan={4}>Jumlah</td>
              <TallyCells t={g.total} bold />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default async function AttendanceListReportPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string; kategori?: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { id: true } });
  if (!event) notFound();

  const sp = await searchParams;
  const basis: AttendanceBasis = sp.mode === "individual" ? "individual" : "counter";
  const listMode: ListMode = sp.kategori === "online" ? "ONLINE" : "BERSEMUKA";
  const d = await computeAttendanceListData(event.id, basis, listMode);
  if (!d) notFound();

  const base = `/organizer/events/${slug}/manage/reports/attendance-list`;
  const qs = (b: AttendanceBasis, m: ListMode) => {
    const q = new URLSearchParams();
    if (m === "ONLINE") q.set("kategori", "online");
    else if (b === "individual") q.set("mode", "individual");
    return q.size ? `?${q}` : "";
  };
  const asAt = new Date(d.generatedAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm } }`}</style>
      <div className="bg-zinc-900 px-6 py-5 print:bg-white print:px-0 print:py-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/organizer/events/${slug}/manage/reports`}
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 print:hidden">
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </Link>
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">Senarai Kehadiran Penyertaan</p>
            <h1 className="text-xl font-black uppercase leading-tight tracking-tight text-white print:text-black md:text-2xl">{d.eventName}</h1>
            <p className="mt-2 text-xs text-zinc-400 print:text-zinc-600">
              <span className="font-semibold uppercase tracking-wider text-zinc-300 print:text-zinc-800">Pertandingan {LIST_MODE_LABEL[listMode]}</span>
              {" · "}Snapshot data setakat {asAt}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 print:hidden">
            <div className="flex max-w-xl flex-wrap justify-end gap-2">
              <a href={`/api/v2/organizer/events/${event.id}/reports/attendance-list/docx${qs(basis, listMode)}`}
                download
                className="flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200">
                <FileDown className="h-4 w-4" /> Word (.docx)
              </a>
              {([["single", "Excel — 1 helaian"], ["multi", "Excel — berbilang helaian"]] as const).map(([layout, label]) => (
                <a key={layout}
                  href={`/api/v2/organizer/events/${event.id}/reports/attendance-list/xlsx${qs(basis, listMode) || "?"}${qs(basis, listMode) ? "&" : ""}layout=${layout}`}
                  download
                  title={layout === "single" ? "Ringkasan dan semua pertandingan dalam satu helaian" : "Helaian Ringkasan dan satu helaian bagi setiap pertandingan"}
                  className="flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200">
                  <FileSpreadsheet className="h-4 w-4" /> {label}
                </a>
              ))}
              <PrintButton />
            </div>
            <div className="flex rounded-lg bg-zinc-800 p-0.5 text-xs font-medium">
              {(["BERSEMUKA", "ONLINE"] as const).map(m => (
                <Link key={m} href={`${base}${qs(basis, m)}`} replace scroll={false}
                  className={`rounded-md px-3 py-1 ${listMode === m ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}>
                  {LIST_MODE_LABEL[m]}
                </Link>
              ))}
            </div>
            {listMode === "BERSEMUKA" && (
              <>
                <div className="flex rounded-lg bg-zinc-800 p-0.5 text-xs font-medium">
                  {([["counter", "Kaunter"], ["individual", "Individu"]] as const).map(([k, l]) => (
                    <Link key={k} href={`${base}${qs(k, listMode)}`} replace scroll={false}
                      className={`rounded-md px-3 py-1 ${basis === k ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}>
                      {l}
                    </Link>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500">Asas kehadiran</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-screen space-y-6 bg-slate-100 px-6 py-6 print:bg-white print:px-0 print:py-0">
        {/* Ringkasan mengikut pertandingan */}
        <section className="rounded-lg border bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {([
              ["Pertandingan", d.groups.length],
              ["Sekolah / kontinjen", d.total.schools],
              ["Penyertaan murid", d.total.murid],
              ["Guru", d.total.guru],
              ["Murid antarabangsa", d.total.internationalMurid],
            ] as const).map(([l, v]) => (
              <div key={l} className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{v.toLocaleString("en-MY")}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-2 text-sm font-black uppercase text-slate-900">Ringkasan mengikut pertandingan</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <TallyHead lead={<>
                <th className={`${TH} w-9`} rowSpan={2}>Bil</th>
                <th className={`${TH} w-20`} rowSpan={2}>Kod</th>
                <th className={`${TH} text-left`} rowSpan={2}>Pertandingan</th>
                <th className={`${TH} w-16`} rowSpan={2}>Sekolah</th>
              </>} />
              <tbody>
                {d.groups.map((g, i) => (
                  <tr key={g.key}>
                    <td className={NUM}>{i + 1}</td>
                    <td className={`${TD} font-mono text-[11px]`}>{g.code}</td>
                    <td className={TD}>
                      {g.name}
                      {g.walkIn && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">Walk-in</span>}
                    </td>
                    <td className={NUM}>{g.rows.length}</td>
                    <TallyCells t={g.total} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className={`${TD} text-center font-black uppercase`} colSpan={3}>Jumlah</td>
                  <td className={`${NUM} font-bold`}>{fmt(d.groups.reduce((s, g) => s + g.rows.length, 0))}</td>
                  <TallyCells t={d.total} bold />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {attendanceListNote(d)}
          </p>
        </section>

        {d.groups.map((g, i) => <CompetitionTable key={g.key} g={g} index={i + 1} />)}
        {!d.groups.length && <p className="py-10 text-center text-sm text-slate-400">Tiada kehadiran direkodkan.</p>}
      </div>
    </OrganizerShell>
  );
}
