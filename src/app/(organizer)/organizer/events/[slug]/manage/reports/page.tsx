import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import Link from "next/link";
import { BarChart3, CheckSquare, UserCheck, FileText } from "lucide-react";

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
    href: null,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
] as const;

export default async function EventReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Laporan</h1>
        <p className="text-sm text-gray-500 mb-8">Pilih laporan untuk dilihat atau dimuat turun.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
