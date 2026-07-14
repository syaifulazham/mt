"use client";

import Link from "next/link";
import {
  ArrowLeft, ClipboardList, Users, BarChart3, Gavel, Trophy, UserPlus,
} from "lucide-react";
import type { OrganizerRole } from "@/types";

const ONLINE_SCOPES = ["ONLINE_NATIONAL", "ONLINE_STATE", "ONLINE_ZONE", "ONLINE_OPEN"];

type EventSummary = {
  id: string; name: string; slug: string; scope: string; status: string;
  startDate: Date | null; endDate: Date | null;
};

type Module = {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  href?: string;
};

const MODULES: Module[] = [
  {
    icon: ClipboardList,
    title: "Pra-Pendaftaran",
    description: "Urus penyertaan dan pengesahan peserta sebelum acara bermula.",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
    href: "preregistration",
  },
  {
    icon: Users,
    title: "Log Kehadiran Peserta",
    description: "Rekod kehadiran peserta semasa hari acara berlangsung.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  {
    icon: BarChart3,
    title: "Laporan",
    description: "Jana laporan statistik penyertaan dan prestasi peserta.",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
    href: "reports",
  },
  {
    icon: Gavel,
    title: "Penghakiman",
    description: "Uruskan panel hakim, kriteria penilaian, dan markah.",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100",
    href: "judging",
  },
  {
    icon: Trophy,
    title: "Keputusan",
    description: "Papar dan umumkan keputusan rasmi pertandingan.",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
    href: "results",
  },
  {
    icon: UserPlus,
    title: "Walk-in Registration",
    description: "Daftar peserta walk-in di kaunter & sahkan kehadiran melalui QR kod.",
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-100",
    href: "walkin",
  },
];

const STATUS_STYLES: Record<string, string> = {
  DRAFT:     "bg-zinc-100 text-zinc-600",
  PUBLISHED: "bg-blue-50 text-blue-700",
  ACTIVE:    "bg-green-50 text-green-700",
  COMPLETED: "bg-purple-50 text-purple-700",
  CANCELLED: "bg-red-50 text-red-500",
  ARCHIVE:   "bg-zinc-100 text-zinc-400",
};

function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function EventManageClient({
  event,
}: {
  event: EventSummary;
  role: OrganizerRole;
}) {
  const start = fmtDate(event.startDate);
  const end   = fmtDate(event.endDate);
  const isOnline = ONLINE_SCOPES.includes(event.scope);
  const modules = MODULES.filter(m => !(isOnline && m.title === "Log Kehadiran Peserta"));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/organizer/events"
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900 truncate">{event.name}</h1>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[event.status] ?? "bg-zinc-100 text-zinc-500"}`}>
              {event.status}
            </span>
          </div>
          {(start || end) && (
            <p className="text-sm text-zinc-400 mt-0.5">
              {start && end ? `${start} – ${end}` : start ?? end}
            </p>
          )}
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const inner = (
            <>
              <div className={`w-10 h-10 rounded-lg ${mod.bg} flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${mod.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-zinc-800">{mod.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{mod.description}</p>
              </div>
              <div className="absolute top-3 right-3">
                {mod.href ? (
                  <span className="text-[9px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    Buka
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-400 px-2 py-0.5 rounded-full">
                    Akan Datang
                  </span>
                )}
              </div>
            </>
          );

          return mod.href ? (
            <Link
              key={mod.title}
              href={`/organizer/events/${event.slug}/manage/${mod.href}`}
              className={`relative rounded-xl border ${mod.border} bg-white p-5 flex flex-col gap-3 hover:shadow-md transition-shadow`}
            >
              {inner}
            </Link>
          ) : (
            <div
              key={mod.title}
              className={`relative rounded-xl border ${mod.border} bg-white p-5 flex flex-col gap-3 opacity-75`}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
