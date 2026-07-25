"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Loader2, Users, Building2, UserCheck, Trophy, GraduationCap, BookOpen, Briefcase, School, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SchoolCategoryData } from "@/lib/export/schoolCategoryExport";

// ── Types ──────────────────────────────────────────────────────────────────────

type Stats = {
  totalParticipation: number;
  totalParticipants: number;
  totalContingents: number;
  totalManagers: number;
  primaryContingents: number;
  secondaryContingents: number;
  higherContingents: number;
  higherContingentTotal: number;
  independentContingents: number;
  internationalContingents: number;
};
type ChartRow    = { label: string; count: number };
type CatChartRow = { key: string; label: string; count: number };
type CompRow     = { code: string; name: string; count: number };
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
    schoolByCategory: CatChartRow[];
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

function HorizBar({
  label, count, max, color, onClick,
}: {
  label: string; count: number; max: number; color: string; onClick?: () => void;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const clickable = !!onClick;
  return (
    <div
      className={cn("flex items-center gap-3 py-1.5 rounded px-1", clickable && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 group")}
      onClick={onClick}
      role={clickable ? "button" : undefined}
    >
      <div className={cn("w-48 shrink-0 text-xs truncate", clickable ? "text-indigo-700 dark:text-indigo-400 group-hover:underline" : "text-zinc-700")} title={label}>{label}</div>
      <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-12 text-right text-xs font-mono text-zinc-500 tabular-nums">{count.toLocaleString()}</div>
    </div>
  );
}

// ── School Category drill-down modal ───────────────────────────────────────────

function SchoolCategoryModal({ categoryKey, onClose }: { categoryKey: string; onClose: () => void }) {
  const [detail,    setDetail]    = useState<SchoolCategoryData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch(`/api/v2/organizer/dashboard/school-category?category=${encodeURIComponent(categoryKey)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setErr(j.error);
        else setDetail(j);
      })
      .catch(() => setErr("Failed to load"))
      .finally(() => setLoading(false));
  }, [categoryKey]);

  async function downloadDocx() {
    if (!detail) return;
    setExporting(true);
    try {
      const { exportSchoolCategoryDocx } = await import("@/lib/export/schoolCategoryExport");
      await exportSchoolCategoryDocx(detail);
    } finally {
      setExporting(false);
    }
  }

  const maxGrade = detail ? Math.max(...detail.byGrade.map((g) => g.count), 1) : 1;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-bold text-zinc-900">
                {loading ? "Loading…" : detail?.categoryLabel ?? categoryKey}
              </DialogTitle>
              <p className="text-xs text-zinc-500 mt-0.5">Drill-down: School Category Statistics</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {detail && (
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={exporting} onClick={downloadDocx}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download DOCX
                </Button>
              )}
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
            </div>
          ) : err ? (
            <p className="text-sm text-red-500 text-center py-12">{err}</p>
          ) : detail ? (
            <>
              {/* ── Summary tiles ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Schools",      value: detail.stats.schools,      color: "bg-indigo-500" },
                  { label: "Participants", value: detail.stats.participants,  color: "bg-blue-500"   },
                  { label: "Male",         value: detail.stats.male,          color: "bg-sky-400"    },
                  { label: "Female",       value: detail.stats.female,        color: "bg-pink-400"   },
                  { label: "Teams",        value: detail.stats.teams,         color: "bg-emerald-500"},
                  { label: "Managers",     value: detail.stats.managers,      color: "bg-violet-500" },
                  { label: "Trainers",     value: detail.stats.trainers,      color: "bg-amber-500"  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border bg-white dark:bg-zinc-900 p-3 text-center">
                    <div className={cn("w-2 h-2 rounded-full mx-auto mb-1.5", color)} />
                    <p className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{value.toLocaleString()}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Charts row ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-zinc-50/80 dark:bg-zinc-800/60">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Participants by Gender</p>
                  </div>
                  <div className="p-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={detail.byGender} barSize={56} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={40} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          <Cell fill="#0ea5e9" />
                          <Cell fill="#f472b6" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-zinc-50/80 dark:bg-zinc-800/60">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Participants by Class Grade</p>
                  </div>
                  <div className="p-4">
                    {detail.byGrade.length === 0 ? (
                      <p className="text-sm text-zinc-400 italic py-4">No grade data.</p>
                    ) : (
                      <div className="space-y-0.5 max-h-52 overflow-y-auto">
                        {detail.byGrade.map((g) => (
                          <HorizBar key={g.label} label={g.label} count={g.count} max={maxGrade} color="#6366f1" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── School list ── */}
              <div className="rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-3 border-b bg-zinc-50/80 dark:bg-zinc-800/60 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    School List
                    <span className="ml-2 text-xs font-normal text-zinc-400">({detail.schools.length} schools)</span>
                  </p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 border-b dark:border-zinc-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">#</th>
                        <th className="text-left px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">State</th>
                        <th className="text-left px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide">School Name</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">Participants</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">Male</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">Female</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">Teams</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">Managers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-800">
                      {detail.schools.map((s, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/40 dark:bg-zinc-800/20"}>
                          <td className="px-3 py-2 text-zinc-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{s.state}</td>
                          <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">{s.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-zinc-700 dark:text-zinc-300">{s.participants || ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-sky-600">{s.male || ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-pink-500">{s.female || ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{s.teams || ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{s.managers || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardClient({ userName }: { userName: string }) {
  const [data,          setData]          = useState<DashData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

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
          <StatCard label="Higher Institution"  value={stats.higherContingents}       icon={School}        color="bg-purple-400"  sub={`${stats.higherContingentTotal} group management`} />
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
              <>
                <p className="text-[10px] text-zinc-400 mb-1.5">Click a category to view detailed stats</p>
                <div className="space-y-0.5 max-h-64 overflow-y-auto">
                  {charts.schoolByCategory.map((r, i) => (
                    <HorizBar
                      key={r.key}
                      label={r.label}
                      count={r.count}
                      max={charts.schoolByCategory[0]?.count ?? 1}
                      color={COLORS[i % COLORS.length]}
                      onClick={() => setDrillCategory(r.key)}
                    />
                  ))}
                </div>
              </>
            )}
          </ChartCard>

        </div>
      </div>

      {drillCategory && (
        <SchoolCategoryModal categoryKey={drillCategory} onClose={() => setDrillCategory(null)} />
      )}

    </div>
  );
}
