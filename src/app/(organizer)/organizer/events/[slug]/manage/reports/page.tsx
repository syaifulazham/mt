import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import Link from "next/link";
import { db } from "@/lib/db";
import { ArrowLeft, BarChart3, CheckSquare, UserCheck, FileText, Users } from "lucide-react";

export const metadata: Metadata = { title: "Laporan" };

const REPORTS = [
  {
    icon: BarChart3,
    title: "Laporan Statistik Penyertaan",
    description: "Laporan ringkas pra-pendaftaran mengikut negeri dan pertandingan.",
    href: "stats-preregistration",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  {
    icon: CheckSquare,
    title: "Laporan Pendaftaran Yang Telah Disahkan",
    description: "Senarai semua pendaftaran pasukan yang telah disahkan untuk acara ini.",
    href: null,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    icon: UserCheck,
    title: "Laporan Kehadiran",
    description: "Rekod kehadiran peserta dan kontinjen semasa acara berlangsung.",
    href: null,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    icon: FileText,
    title: "Laporan Akhir Program",
    description: "Ringkasan keseluruhan program termasuk keputusan dan pencapaian.",
    href: "final-program",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
] as const;

export default async function EventReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!event) redirect("/organizer/events");

  const [duplicateRow] = await db.$queryRaw<{ count: number }[]>`
    WITH event_teams AS (
      SELECT t.id AS "teamId", t."competitionId"
      FROM team_events te
      JOIN teams t ON t.id = te."teamId"
      WHERE te."eventId" = ${event.id}
        AND te.acceptance IN ('PENDING', 'ACCEPT')
    )
    SELECT COUNT(DISTINCT "contestantId")::int AS count
    FROM (
      SELECT tm."contestantId"
      FROM team_members tm
      JOIN event_teams et ON et."teamId" = tm."teamId"
      GROUP BY tm."contestantId"
      HAVING COUNT(DISTINCT tm."teamId") > 1 OR COUNT(DISTINCT et."competitionId") > 1
    ) d
  `;
  const duplicateCount = Number(duplicateRow?.count ?? 0);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-start gap-3 mb-6">
          <Link
            href={`/organizer/events/${slug}/manage`}
            className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </Link>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Laporan</h1>
            <p className="text-sm text-zinc-400">Pilih laporan untuk dilihat atau dimuat turun.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {duplicateCount > 0 && (
            <Link
              href={`/organizer/events/${slug}/manage/reports/duplicate-participation`}
              className="block"
            >
              <div className="flex flex-col gap-3 rounded-xl border p-5 h-full transition-all border-rose-200 bg-rose-50 cursor-pointer hover:shadow-md hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-rose-600" />
                  <span className="text-sm font-semibold text-rose-600">Penyertaan Berganda</span>
                  <span className="ml-auto text-xs font-bold text-white bg-rose-600 rounded-full px-2 py-0.5">
                    {duplicateCount}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Peserta yang menjadi ahli lebih daripada satu pasukan atau menyertai lebih daripada satu pertandingan.
                </p>
              </div>
            </Link>
          )}
          {REPORTS.map((r) => {
            const Icon = r.icon;
            const card = (
              <div
                className={`flex flex-col gap-3 rounded-xl border p-5 h-full transition-all ${r.border} ${r.bg} ${
                  r.href
                    ? "cursor-pointer hover:shadow-md hover:scale-[1.01]"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div className={`flex items-center gap-3`}>
                  <Icon className={`w-6 h-6 ${r.color}`} />
                  <span className={`text-sm font-semibold ${r.color}`}>{r.title}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{r.description}</p>
                {!r.href && (
                  <span className="mt-auto self-start text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                    Akan datang
                  </span>
                )}
              </div>
            );

            return r.href ? (
              <Link
                key={r.title}
                href={`/organizer/events/${slug}/manage/reports/${r.href}`}
                className="block"
              >
                {card}
              </Link>
            ) : (
              <div key={r.title}>{card}</div>
            );
          })}
        </div>
      </div>
    </OrganizerShell>
  );
}
