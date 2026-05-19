"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Building2, MapPin, Users, Trophy, User, GraduationCap, BookOpen, Baby } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ContingentDetail = {
  id: string; name: string; shortName: string | null;
  contingentType: string; status: string;
  school: { id: string; name: string } | null;
  higherInstitution: { id: string; name: string } | null;
  state: { id: string; name: string } | null;
  zone:  { id: string; name: string } | null;
  managers: {
    id: string; role: string; status: string;
    manager: { id: string; name: string; email: string; phone: string | null };
  }[];
  participants: {
    id: string; name: string; gender: string; eduLevel: string; ppki: boolean; age: number | null;
  }[];
  teams: {
    id: string; name: string; status: string;
    competition: { id: string; code: string; name: string; participationType: string };
    _count: { members: number };
  }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  SCHOOL: "bg-sky-50 text-sky-700 border-sky-200",
  HIGHER: "bg-violet-50 text-violet-700 border-violet-200",
  INDEPENDENT: "bg-amber-50 text-amber-700 border-amber-200",
  INTERNATIONAL: "bg-rose-50 text-rose-700 border-rose-200",
};

const EDU_INFO: Record<string, { label: string; bg: string; text: string; Icon: React.ElementType }> = {
  PRIMARY:   { label: "Primary",   bg: "bg-emerald-100", text: "text-emerald-700", Icon: BookOpen      },
  SECONDARY: { label: "Secondary", bg: "bg-blue-100",    text: "text-blue-700",    Icon: GraduationCap },
  YOUTH:     { label: "Youth",     bg: "bg-purple-100",  text: "text-purple-600",  Icon: Baby          },
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-zinc-50/80">
        <Icon className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContingentDetailClient({ data }: { data: ContingentDetail }) {
  const router = useRouter();
  const institution = data.school ?? data.higherInstitution;

  const byLevel = data.participants.reduce<Record<string, number>>((acc, p) => {
    acc[p.eduLevel] = (acc[p.eduLevel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => router.push("/organizer/participation?tab=contingents")}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Back to Participation
        </button>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900">{data.name}</h1>
              {data.shortName && <span className="text-zinc-400 text-sm">({data.shortName})</span>}
              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", TYPE_COLORS[data.contingentType] ?? "bg-zinc-100 text-zinc-500 border-zinc-200")}>
                {data.contingentType}
              </span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                data.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                {data.status}
              </span>
            </div>
            {institution && (
              <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />{institution.name}
              </p>
            )}
            {(data.state || data.zone) && (
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[data.state?.name, data.zone?.name].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Managers */}
      <Section title={`Managers (${data.managers.length})`} icon={Users}>
        {data.managers.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No managers assigned.</p>
        ) : (
          <div className="divide-y -my-1">
            {data.managers.map(cm => (
              <div key={cm.id} className="flex items-center gap-3 py-2.5">
                <div className="h-7 w-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-zinc-500">{cm.manager.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{cm.manager.name}</p>
                  <p className="text-xs text-zinc-400">{cm.manager.email}</p>
                </div>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  cm.role === "OWNER" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500")}>
                  {cm.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Participants summary */}
      <Section title={`Participants (${data.participants.length})`} icon={User}>
        {data.participants.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No participants registered.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              {Object.entries(byLevel).map(([level, count]) => {
                const info = EDU_INFO[level] ?? { label: level, bg: "bg-zinc-100", text: "text-zinc-500", Icon: User };
                return (
                  <div key={level} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", info.bg)}>
                    <info.Icon className={cn("h-4 w-4", info.text)} />
                    <span className={cn("text-sm font-semibold", info.text)}>{count}</span>
                    <span className={cn("text-xs", info.text)}>{info.label}</span>
                  </div>
                );
              })}
              {data.participants.filter(p => p.ppki).length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50">
                  <span className="text-sm font-semibold text-orange-700">{data.participants.filter(p => p.ppki).length}</span>
                  <span className="text-xs text-orange-700">OKU</span>
                </div>
              )}
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Level</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Gender</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map(p => {
                    const info = EDU_INFO[p.eduLevel] ?? { label: p.eduLevel, bg: "", text: "text-zinc-500", Icon: User };
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="px-3 py-2">
                          <span className="font-medium text-zinc-800">{p.name}</span>
                          {p.ppki && <span className="ml-1.5 text-[10px] bg-orange-50 text-orange-600 px-1 py-0.5 rounded-full">OKU</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("text-xs flex items-center gap-1 w-fit", info.text)}>
                            <info.Icon className="h-3 w-3" />{info.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{p.gender}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{p.age ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Teams */}
      <Section title={`Teams (${data.teams.length})`} icon={Trophy}>
        {data.teams.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No teams registered.</p>
        ) : (
          <div className="divide-y -my-1">
            {data.teams.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{t.name}</p>
                  <p className="text-xs text-zinc-400">
                    <span className="font-mono">{t.competition.code}</span>
                    <span className="mx-1">—</span>
                    {t.competition.name}
                  </p>
                </div>
                <span className="text-[10px] text-zinc-400">{t._count.members} members</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
