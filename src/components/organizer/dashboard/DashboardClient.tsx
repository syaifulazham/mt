"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Loader2, Users, Building2, UserCheck, Trophy, GraduationCap, BookOpen, Briefcase, School } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Stats = {
  totalParticipation: number;
  totalParticipants: number;
  totalContingents: number;
  totalManagers: number;
  primaryContingents: number;
  secondaryContingents: number;
  higherContingents: number;
  independentContingents: number;
  internationalContingents: number;
};
type ChartRow = { label: string; count: number };
type CompRow  = { code: string; name: string; count: number };
type DashData = {
  stats: Stats;
  charts: {
    byGender: ChartRow[];
    byEthnicity: ChartRow[];
    byZone: ChartRow[];
    byState: ChartRow[];
    byCompetition: CompRow[];
    schoolByZone: ChartRow[];
    schoolByState: ChartRow[];
    schoolByLocality: ChartRow[];
    schoolByCategory: ChartRow[];
  };
};

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];

// ── Stat card ─────────────────────────────────────────────────────────────────

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

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-zinc-800">{label}</p>
      <p className="text-zinc-500 mt-0.5">{payload[0].value.toLocaleString()} participants</p>
    </div>
  );
}

// ── Pie tooltip ────────────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: {name: string; value: number; payload: {pct: number}}[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-zinc-800">{item.name}</p>
      <p className="text-zinc-500 mt-0.5">{item.value.toLocaleString()} ({item.payload.pct}%)</p>
    </div>
  );
}

// ── Horizontal bar (custom, for competition list) ──────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardClient({ userName }: { userName: string }) {
  const [data,    setData]    = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v2/organizer/dashboard")
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }
  if (!data) return null;

  const { stats, charts } = data;
  const maxZone = Math.max(...charts.byZone.map(c => c.count), 1);

  const ethTotal = charts.byEthnicity.reduce((s, e) => s + e.count, 0);
  const ethPie = charts.byEthnicity.map(e => ({
    name: e.label,
    value: e.count,
    pct: ethTotal > 0 ? Math.round((e.count / ethTotal) * 100) : 0,
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-7">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Welcome back, {userName}</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Participation"  value={stats.totalParticipation} icon={Trophy}    color="bg-[#085782]"   sub="across all competitions" />
        <StatCard label="Total Contingents"    value={stats.totalContingents}   icon={Building2} color="bg-sky-500"     />
        <StatCard label="Registered Managers"  value={stats.totalManagers}      icon={UserCheck} color="bg-violet-500"  />
      </div>

      {/* Contingent breakdown */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Contingents by Type</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Primary School"      value={stats.primaryContingents}      icon={BookOpen}      color="bg-emerald-400" />
          <StatCard label="Secondary School"    value={stats.secondaryContingents}    icon={GraduationCap} color="bg-blue-400"    />
          <StatCard label="Higher Institution"  value={stats.higherContingents}       icon={School}        color="bg-purple-400"  />
          <StatCard label="Independent"         value={stats.independentContingents}  icon={Briefcase}     color="bg-amber-400"   />
          <StatCard label="International"       value={stats.internationalContingents} icon={Users}        color="bg-rose-400"    />
        </div>
      </div>

      {/* Charts row 1: gender + zone */}
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

        <ChartCard title="Participation by Zone">
          {charts.byZone.length === 0 ? (
            <p className="text-sm text-zinc-400 italic py-4">No zone data.</p>
          ) : (
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {charts.byZone.map((z, i) => (
                <HorizBar key={z.label} label={z.label} count={z.count} max={maxZone} color={COLORS[i % COLORS.length]} />
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

      {/* Chart: state */}
      <ChartCard title="Participation by State">
        {charts.byState.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No state data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, charts.byState.length * 28)}>
            <BarChart data={charts.byState} layout="vertical" barSize={16} margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {charts.byState.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* School contingent locality */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">School Contingents by Locality</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <ChartCard title="By Zone">
            {charts.schoolByZone.length === 0 ? (
              <p className="text-sm text-zinc-400 italic py-4">No zone data.</p>
            ) : (
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {charts.schoolByZone.map((z, i) => (
                  <HorizBar key={z.label} label={z.label} count={z.count} max={charts.schoolByZone[0]?.count ?? 1} color={COLORS[i % COLORS.length]} />
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="By State">
            {charts.schoolByState.length === 0 ? (
              <p className="text-sm text-zinc-400 italic py-4">No state data.</p>
            ) : (
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {charts.schoolByState.map((s, i) => (
                  <HorizBar key={s.label} label={s.label} count={s.count} max={charts.schoolByState[0]?.count ?? 1} color={COLORS[i % COLORS.length]} />
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="By Locality Type">
            {charts.schoolByLocality.length === 0 ? (
              <p className="text-sm text-zinc-400 italic py-4">No locality data.</p>
            ) : (
              <div className="space-y-1.5">
                {charts.schoolByLocality.map((r, i) => (
                  <HorizBar key={r.label} label={r.label} count={r.count} max={charts.schoolByLocality.filter(x => x.label !== "Tiada Lokaliti")[0]?.count ?? charts.schoolByLocality[0]?.count ?? 1} color={COLORS[i % COLORS.length]} />
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="By School Category">
            {charts.schoolByCategory.length === 0 ? (
              <p className="text-sm text-zinc-400 italic py-4">No category data.</p>
            ) : (
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {charts.schoolByCategory.map((r, i) => (
                  <HorizBar key={r.label} label={r.label} count={r.count} max={charts.schoolByCategory[0]?.count ?? 1} color={COLORS[i % COLORS.length]} />
                ))}
              </div>
            )}
          </ChartCard>

        </div>
      </div>

    </div>
  );
}
