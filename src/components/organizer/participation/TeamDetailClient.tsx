"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, GraduationCap, BookOpen, Baby, Users, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type TeamDetail = {
  id: string; name: string; status: string;
  competition: { id: string; code: string; name: string; participationType: string; minTeamSize: number; maxTeamSize: number };
  contingent: { id: string; name: string; shortName: string | null; contingentType: string };
  members: {
    id: string;
    participant: { id: string; name: string; gender: string; eduLevel: string; age: number | null; ic: string | null; ppki: boolean };
  }[];
  trainers: {
    id: string;
    trainer: { id: string; name: string; email: string | null; phoneNumber: string | null };
  }[];
};

const EDU_INFO: Record<string, { label: string; text: string; Icon: React.ElementType }> = {
  PRIMARY:   { label: "Primary",   text: "text-emerald-600", Icon: BookOpen      },
  SECONDARY: { label: "Secondary", text: "text-blue-600",    Icon: GraduationCap },
  YOUTH:     { label: "Youth",     text: "text-purple-600",  Icon: Baby          },
};

const TYPE_COLORS: Record<string, string> = {
  SCHOOL: "bg-sky-50 text-sky-700",
  HIGHER: "bg-violet-50 text-violet-700",
  INDEPENDENT: "bg-amber-50 text-amber-700",
  INTERNATIONAL: "bg-rose-50 text-rose-700",
};

export function TeamDetailClient({ data }: { data: TeamDetail }) {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => router.push("/organizer/participation?tab=teams")}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Back to Participation
        </button>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900">{data.name}</h1>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                data.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500")}>
                {data.status}
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              <span className="font-mono">{data.competition.code}</span>
              <span className="mx-1.5 text-zinc-300">—</span>
              {data.competition.name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TYPE_COLORS[data.contingent.contingentType] ?? "bg-zinc-100 text-zinc-500")}>
                {data.contingent.contingentType}
              </span>
              <span className="text-sm text-zinc-500">{data.contingent.name}</span>
              {data.contingent.shortName && <span className="text-xs text-zinc-400">({data.contingent.shortName})</span>}
            </div>
            {data.competition.participationType === "TEAM" && (
              <p className="text-xs text-zinc-400 mt-1">
                Team size: {data.competition.minTeamSize}–{data.competition.maxTeamSize} members
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-zinc-50/80">
          <Users className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700">Members ({data.members.length})</h3>
        </div>
        <div className="p-5">
          {data.members.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No members.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Level</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Gender</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Age</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">IC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map(m => {
                    const edu = EDU_INFO[m.participant.eduLevel] ?? { label: m.participant.eduLevel, text: "text-zinc-500", Icon: GraduationCap };
                    return (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="px-3 py-2">
                          <span className="font-medium text-zinc-800">{m.participant.name}</span>
                          {m.participant.ppki && <span className="ml-1.5 text-[10px] bg-orange-50 text-orange-600 px-1 py-0.5 rounded-full">OKU</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("text-xs flex items-center gap-1 w-fit", edu.text)}>
                            <edu.Icon className="h-3 w-3" />{edu.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{m.participant.gender}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{m.participant.age ?? "—"}</td>
                        <td className="px-3 py-2 text-xs font-mono text-zinc-400">{m.participant.ic ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Trainers */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-zinc-50/80">
          <UserCheck className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700">Trainers ({data.trainers.length})</h3>
        </div>
        <div className="p-5">
          {data.trainers.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No trainers assigned.</p>
          ) : (
            <div className="divide-y -my-1">
              {data.trainers.map(tr => (
                <div key={tr.id} className="flex items-center gap-3 py-2.5">
                  <div className="h-7 w-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-zinc-500">{tr.trainer.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800">{tr.trainer.name}</p>
                    <p className="text-xs text-zinc-400">
                      {[tr.trainer.email, tr.trainer.phoneNumber].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
