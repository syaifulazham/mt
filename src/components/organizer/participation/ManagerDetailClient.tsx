"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Building2, Mail, Phone, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type ManagerDetail = {
  id: string; name: string; email: string; phone: string | null;
  idType: string | null; idNumber: string | null; institutionType: string | null;
  school: { id: string; name: string } | null;
  higherInstitution: { id: string; name: string } | null;
  contingentManagers: {
    id: string; role: string; status: string;
    contingent: {
      id: string; name: string; shortName: string | null;
      contingentType: string; status: string;
      state: { id: string; name: string } | null;
      _count: { participants: number; teams: number };
    };
  }[];
};

const TYPE_COLORS: Record<string, string> = {
  SCHOOL: "bg-sky-50 text-sky-700",
  HIGHER: "bg-violet-50 text-violet-700",
  INDEPENDENT: "bg-amber-50 text-amber-700",
  INTERNATIONAL: "bg-rose-50 text-rose-700",
};

export function ManagerDetailClient({ data }: { data: ManagerDetail }) {
  const router = useRouter();
  const institution = data.school ?? data.higherInstitution;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div>
        <button onClick={() => router.push("/organizer/participation?tab=managers")}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Back to Participation
        </button>
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-zinc-400">{data.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900">{data.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{data.email}</span>
              {data.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{data.phone}</span>}
            </div>
            {institution && (
              <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />{institution.name}
              </p>
            )}
            {(data.idType && data.idNumber) && (
              <p className="text-xs text-zinc-400 mt-0.5">{data.idType}: {data.idNumber}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contingents */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-zinc-50/80">
          <Shield className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700">
            Contingents Managed ({data.contingentManagers.length})
          </h3>
        </div>
        <div className="p-5">
          {data.contingentManagers.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No contingents managed.</p>
          ) : (
            <div className="divide-y -my-1">
              {data.contingentManagers.map(cm => (
                <div key={cm.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-zinc-800">{cm.contingent.name}</p>
                      {cm.contingent.shortName && (
                        <span className="text-xs text-zinc-400">({cm.contingent.shortName})</span>
                      )}
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", TYPE_COLORS[cm.contingent.contingentType] ?? "bg-zinc-100 text-zinc-500")}>
                        {cm.contingent.contingentType}
                      </span>
                    </div>
                    {cm.contingent.state && (
                      <p className="text-xs text-zinc-400 mt-0.5">{cm.contingent.state.name}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-[10px] text-zinc-400">
                      <span>{cm.contingent._count.participants} participants</span>
                      <span>{cm.contingent._count.teams} teams</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      cm.role === "OWNER" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500")}>
                      {cm.role}
                    </span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full",
                      cm.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-400")}>
                      {cm.status}
                    </span>
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
