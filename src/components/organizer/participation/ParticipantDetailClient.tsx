"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Building2, GraduationCap, BookOpen, Baby, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type ParticipantDetail = {
  id: string; name: string; ic: string | null; email: string | null; phoneNumber: string | null;
  gender: string; age: number | null; eduLevel: string; classGrade: string | null;
  className: string | null; status: string; ppki: boolean;
  contingent: {
    id: string; name: string; shortName: string | null; contingentType: string;
    school: { id: string; name: string } | null;
    higherInstitution: { id: string; name: string } | null;
  };
  teamMembers: {
    id: string;
    team: {
      id: string; name: string; status: string;
      competition: { id: string; code: string; name: string; participationType: string };
      contingent: { id: string; name: string };
    };
  }[];
};

const EDU_INFO: Record<string, { label: string; bg: string; text: string; Icon: React.ElementType }> = {
  KINDERGARTEN: { label: "Kindergarten",    bg: "bg-yellow-100", text: "text-yellow-700", Icon: Baby          },
  PRIMARY:      { label: "Primary School",  bg: "bg-emerald-100", text: "text-emerald-700", Icon: BookOpen    },
  SECONDARY:    { label: "Secondary School", bg: "bg-blue-100",   text: "text-blue-700",    Icon: GraduationCap },
  YOUTH:        { label: "Youth / Belia",   bg: "bg-purple-100", text: "text-purple-600",  Icon: Baby          },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <span className="text-xs text-zinc-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-zinc-800 flex-1">{value ?? "—"}</span>
    </div>
  );
}

export function ParticipantDetailClient({ data }: { data: ParticipantDetail }) {
  const router = useRouter();
  const edu = EDU_INFO[data.eduLevel] ?? { label: data.eduLevel, bg: "bg-zinc-100", text: "text-zinc-500", Icon: GraduationCap };
  const institution = data.contingent.school ?? data.contingent.higherInstitution;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => router.push("/organizer/participation?tab=participants")}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Back to Participation
        </button>
        <div className="flex items-start gap-4">
          <div className={cn("h-12 w-12 rounded-full flex items-center justify-center shrink-0", edu.bg)}>
            <edu.Icon className={cn("h-5 w-5", edu.text)} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900">{data.name}</h1>
              {data.ppki && (
                <span className="text-xs bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full font-medium">OKU</span>
              )}
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", edu.bg, edu.text)}>{edu.label}</span>
            </div>
            <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />{data.contingent.name}
              {institution && <span className="text-zinc-400"> · {institution.name}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50/80">
          <h3 className="text-sm font-semibold text-zinc-700">Profile</h3>
        </div>
        <div className="px-5">
          <InfoRow label="Gender"    value={data.gender} />
          <InfoRow label="Age"       value={data.age} />
          <InfoRow label="IC / ID"   value={data.ic ? <span className="font-mono">{data.ic}</span> : null} />
          <InfoRow label="Email"     value={data.email} />
          <InfoRow label="Phone"     value={data.phoneNumber} />
          <InfoRow label="Class"     value={[data.classGrade, data.className].filter(Boolean).join(" · ") || null} />
          <InfoRow label="Status"    value={
            <span className={cn("text-xs px-1.5 py-0.5 rounded-full",
              data.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500")}>
              {data.status}
            </span>
          } />
        </div>
      </div>

      {/* Teams */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-zinc-50/80">
          <Trophy className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700">Team Enrollments ({data.teamMembers.length})</h3>
        </div>
        <div className="p-5">
          {data.teamMembers.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">Not enrolled in any team.</p>
          ) : (
            <div className="divide-y -my-1">
              {data.teamMembers.map(tm => (
                <div key={tm.id} className="py-2.5">
                  <p className="text-sm font-medium text-zinc-800">{tm.team.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    <span className="font-mono">{tm.team.competition.code}</span>
                    <span className="mx-1">—</span>
                    {tm.team.competition.name}
                  </p>
                  <p className="text-xs text-zinc-400">{tm.team.contingent.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
