"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  Loader2, Trophy, Building2, UserCheck,
  GraduationCap, BookOpen, Briefcase, Users, School,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];

// ── Types ──────────────────────────────────────────────────────────────────────

type ZoneListItem = {
  id: string;
  name: string;
  participantCount: number;
};

type Stats = {
  totalParticipation: number;
  totalContingents: number;
  totalManagers: number;
  primaryContingents: number;
  secondaryContingents: number;
  higherContingents: number;
  independentContingents: number;
  internationalContingents: number;
};

type ChartRow = { label: string; count: number };

type ZoneDetail = {
  zone: { id: string; name: string };
  stats: Stats;
  charts: {
    byGender: ChartRow[];
    byState: ChartRow[];
    byEthnicity: ChartRow[];
  };
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string; value: number | string;
  icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4">
      <div className={cn("p-2.5 rounded-lg shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 mt-0.5 tabular-nums">{value.toLocaleString()}</p>
        {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Chart card ─────────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-zinc-50/80">
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-zinc-800">{label}</p>
      <p className="text-zinc-500 mt-0.5">{payload[0].value.toLocaleString()} participants</p>
    </div>
  );
}

// ── Pie tooltip ────────────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { pct: number } }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-zinc-800">{item.name}</p>
      <p className="text-zinc-500 mt-0.5">{item.value.toLocaleString()} ({item.payload.pct}%)</p>
    </div>
  );
}

// ── Horizontal bar ─────────────────────────────────────────────────────────────

function HorizBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-48 shrink-0 text-xs text-zinc-700 truncate" title={label}>{label}</div>
      <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-12 text-right text-xs font-mono text-zinc-500 tabular-nums">{count.toLocaleString()}</div>
    </div>
  );
}

// ── Zone stats panel ───────────────────────────────────────────────────────────

function ZoneStatsPanel({ detail, loading }: { detail: ZoneDetail | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-zinc-400 italic">Pilih zon untuk melihat statistik.</p>
      </div>
    );
  }

  const { stats, charts, zone } = detail;

  const maxState = Math.max(...charts.byState.map(s => s.count), 1);

  const ethTotal = charts.byEthnicity.reduce((s, e) => s + e.count, 0);
  const ethPie = charts.byEthnicity.map(e => ({
    name: e.label,
    value: e.count,
    pct: ethTotal > 0 ? Math.round((e.count / ethTotal) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Zone heading */}
      <div>
        <h2 className="text-xl font-bold text-zinc-900">{zone.name}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Zone statistics</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Participation"  value={stats.totalParticipation} icon={Trophy}    color="bg-[#085782]"  sub="across all competitions" />
        <StatCard label="Total Contingents"    value={stats.totalContingents}   icon={Building2} color="bg-sky-500"    />
        <StatCard label="Registered Managers"  value={stats.totalManagers}      icon={UserCheck} color="bg-violet-500" />
      </div>

      {/* Contingent breakdown */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Contingents by Type</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Primary School"     value={stats.primaryContingents}       icon={BookOpen}      color="bg-emerald-400" />
          <StatCard label="Secondary School"   value={stats.secondaryContingents}     icon={GraduationCap} color="bg-blue-400"    />
          <StatCard label="Higher Institution" value={stats.higherContingents}        icon={School}        color="bg-purple-400"  />
          <StatCard label="Independent"        value={stats.independentContingents}   icon={Briefcase}     color="bg-amber-400"   />
          <StatCard label="International"      value={stats.internationalContingents} icon={Users}         color="bg-rose-400"    />
        </div>
      </div>

      {/* Charts row: gender + state */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Participation by Gender">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={charts.byGender} barSize={48} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {charts.byGender.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#0ea5e9" : "#f472b6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Participation by State">
          {charts.byState.length === 0 ? (
            <p className="text-sm text-zinc-400 italic py-4">No state data.</p>
          ) : (
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {charts.byState.map((s, i) => (
                <HorizBar key={s.label} label={s.label} count={s.count} max={maxState} color={COLORS[i % COLORS.length]} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Chart: ethnicity */}
      <ChartCard title="Participation by Race / Ethnicity">
        {ethPie.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No ethnicity data.</p>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={220} className="lg:max-w-xs shrink-0">
              <PieChart>
                <Pie
                  data={ethPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={48}
                  paddingAngle={2}
                >
                  {ethPie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 w-full space-y-0.5">
              {charts.byEthnicity.map((e, i) => (
                <HorizBar
                  key={e.label}
                  label={e.label}
                  count={e.count}
                  max={charts.byEthnicity[0]?.count ?? 1}
                  color={COLORS[i % COLORS.length]}
                />
              ))}
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ZoneDashboardClient() {
  const [zones,          setZones]          = useState<ZoneListItem[]>([]);
  const [zonesLoading,   setZonesLoading]   = useState(true);
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [detail,         setDetail]         = useState<ZoneDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);

  // Load zone list
  useEffect(() => {
    fetch("/api/v2/organizer/dashboard/zones")
      .then(r => r.json())
      .then((json: { data: ZoneListItem[] }) => {
        setZones(json.data ?? []);
        if (json.data?.length) setSelectedId(json.data[0].id);
      })
      .finally(() => setZonesLoading(false));
  }, []);

  // Load detail whenever selected zone changes
  useEffect(() => {
    if (selectedId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/v2/organizer/dashboard/zones/${selectedId}`)
      .then(r => r.json())
      .then((json: ZoneDetail) => setDetail(json))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  return (
    <div className="flex h-full min-h-[70vh]">
      {/* ── Left panel: zone list ──────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50/60 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Zones</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {zonesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : zones.length === 0 ? (
            <p className="text-xs text-zinc-400 italic px-4 py-4">No zones found.</p>
          ) : (
            <ul className="py-2">
              {zones.map(z => (
                <li key={z.id}>
                  <button
                    onClick={() => setSelectedId(z.id)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-start justify-between gap-2",
                      selectedId === z.id
                        ? "bg-[#085782]/10 text-[#085782] font-semibold"
                        : "text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    <span className="truncate">{z.name}</span>
                    <span className={cn(
                      "shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                      selectedId === z.id
                        ? "bg-[#085782]/20 text-[#085782]"
                        : "bg-zinc-200 text-zinc-500"
                    )}>
                      {z.participantCount.toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right panel: stats ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        <ZoneStatsPanel detail={detail} loading={detailLoading} />
      </main>
    </div>
  );
}
