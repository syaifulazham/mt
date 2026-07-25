"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  Loader2, Trophy, Building2, UserCheck,
  GraduationCap, BookOpen, Briefcase, Users, School, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];

// ── Types ──────────────────────────────────────────────────────────────────────

type StateListItem = {
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

type StateDetail = {
  state: { id: string; name: string };
  stats: Stats;
  charts: {
    byGender: ChartRow[];
    byEthnicity: ChartRow[];
    byPpd: ChartRow[];
  };
};

type ContingentItem = {
  id: string;
  name: string;
  shortName: string | null;
  ppd: string | null;
  schoolName: string | null;
  institutionName: string | null;
};

type ModalInfo = {
  stateId: string;
  stateName: string;
  type: string;   // PRIMARY | SECONDARY | HIGHER | INDEPENDENT | INTERNATIONAL
  label: string;  // display label for the modal title
  isSchool: boolean;
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub, onClick,
}: {
  label: string; value: number | string;
  icon: React.ElementType; color: string; sub?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className={cn(
      "bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4",
      onClick && "cursor-pointer hover:shadow-md hover:border-zinc-300 transition-all",
    )}>
      <div className={cn("p-2.5 rounded-lg shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 mt-0.5 tabular-nums">{value.toLocaleString()}</p>
        {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
        {onClick && <p className="text-[10px] text-blue-500 mt-1 font-medium">Lihat senarai →</p>}
      </div>
    </div>
  );

  return onClick
    ? <button type="button" onClick={onClick} className="text-left w-full">{inner}</button>
    : inner;
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

// ── Contingent list modal ──────────────────────────────────────────────────────

function ContingentModal({
  info, onClose,
}: {
  info: ModalInfo;
  onClose: () => void;
}) {
  const [items, setItems]     = useState<ContingentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Component is keyed by stateId+type so it remounts fresh on each open.
  // The initial useState(true) for loading is always correct; no synchronous
  // setState needed inside the effect.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/organizer/dashboard/states/${info.stateId}/contingents?type=${info.type}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((j) => { if (!cancelled) setItems(j.data ?? []); })
      .catch(() => { if (!cancelled) setError("Gagal memuatkan senarai."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50/80 shrink-0">
          <div>
            <h2 className="text-base font-bold text-zinc-900">{info.label}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{info.stateName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-10">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-400 italic text-center py-10">Tiada kontinjen ditemui.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 border-b z-10">
                <tr className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left w-10">#</th>
                  <th className="px-5 py-3 text-left">Nama Penuh</th>
                  <th className="px-5 py-3 text-left w-36">Nama Singkat</th>
                  {info.isSchool && (
                    <th className="px-5 py-3 text-left w-40">PPD / Daerah</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-white" : "bg-zinc-50/40")}>
                    <td className="px-5 py-3 text-zinc-400 text-xs tabular-nums">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-zinc-800">{c.name}</td>
                    <td className="px-5 py-3 text-zinc-500 text-xs">{c.shortName ?? "—"}</td>
                    {info.isSchool && (
                      <td className="px-5 py-3 text-zinc-500 text-xs">{c.ppd ?? "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {!loading && !error && items.length > 0 && (
          <div className="px-6 py-3 border-t bg-zinc-50/80 shrink-0 text-xs text-zinc-400">
            {items.length} kontinjen
          </div>
        )}
      </div>
    </div>
  );
}

// ── State stats panel ──────────────────────────────────────────────────────────

function StateStatsPanel({
  detail, loading, onContingentTypeClick,
}: {
  detail: StateDetail | null;
  loading: boolean;
  onContingentTypeClick: (type: string, label: string, isSchool: boolean) => void;
}) {
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
        <p className="text-sm text-zinc-400 italic">Pilih negeri untuk melihat statistik.</p>
      </div>
    );
  }

  const { stats, charts, state } = detail;

  const maxPpd = Math.max(...(charts.byPpd ?? []).map(p => p.count), 1);

  const ethTotal = charts.byEthnicity.reduce((s, e) => s + e.count, 0);
  const ethPie = charts.byEthnicity.map(e => ({
    name: e.label,
    value: e.count,
    pct: ethTotal > 0 ? Math.round((e.count / ethTotal) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* State heading */}
      <div>
        <h2 className="text-xl font-bold text-zinc-900">{state.name}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">State statistics</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Participation"  value={stats.totalParticipation} icon={Trophy}    color="bg-[#085782]"  sub="across all competitions" />
        <StatCard label="Total Contingents"    value={stats.totalContingents}   icon={Building2} color="bg-sky-500"    />
        <StatCard label="Registered Managers"  value={stats.totalManagers}      icon={UserCheck} color="bg-violet-500" />
      </div>

      {/* Contingent breakdown — clickable */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Contingents by Type</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Primary School" value={stats.primaryContingents}
            icon={BookOpen} color="bg-emerald-400"
            onClick={() => onContingentTypeClick("PRIMARY", "Sekolah Rendah", true)}
          />
          <StatCard
            label="Secondary School" value={stats.secondaryContingents}
            icon={GraduationCap} color="bg-blue-400"
            onClick={() => onContingentTypeClick("SECONDARY", "Sekolah Menengah", true)}
          />
          <StatCard
            label="Higher Institution" value={stats.higherContingents}
            icon={School} color="bg-purple-400"
            onClick={() => onContingentTypeClick("HIGHER", "Institusi Pengajian Tinggi", false)}
          />
          <StatCard
            label="Independent" value={stats.independentContingents}
            icon={Briefcase} color="bg-amber-400"
            onClick={() => onContingentTypeClick("INDEPENDENT", "Bebas", false)}
          />
          <StatCard
            label="International" value={stats.internationalContingents}
            icon={Users} color="bg-rose-400"
            onClick={() => onContingentTypeClick("INTERNATIONAL", "Antarabangsa", false)}
          />
        </div>
      </div>

      {/* Charts row: gender + ethnicity */}
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

        <ChartCard title="Participation by Race / Ethnicity">
          {ethPie.length === 0 ? (
            <p className="text-sm text-zinc-400 italic py-4">No ethnicity data.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={ethPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {ethPie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full space-y-0.5">
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

      {/* Chart: PPD / District */}
      <ChartCard title="Participation by PPD / District">
        {!charts.byPpd || charts.byPpd.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No PPD data.</p>
        ) : (
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {charts.byPpd.map((p, i) => (
              <HorizBar key={p.label} label={p.label} count={p.count} max={maxPpd} color={COLORS[i % COLORS.length]} />
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StateDashboardClient() {
  const [states,        setStates]        = useState<StateListItem[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [detail,        setDetail]        = useState<StateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal,         setModal]         = useState<ModalInfo | null>(null);

  // Load state list
  useEffect(() => {
    fetch("/api/v2/organizer/dashboard/states")
      .then(r => r.json())
      .then((json: { data: StateListItem[] }) => {
        setStates(json.data ?? []);
        if (json.data?.length) setSelectedId(json.data[0].id);
      })
      .finally(() => setStatesLoading(false));
  }, []);

  // Load detail whenever selected state changes
  useEffect(() => {
    if (selectedId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/v2/organizer/dashboard/states/${selectedId}`)
      .then(r => r.json())
      .then((json: StateDetail) => setDetail(json))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  function handleContingentTypeClick(type: string, label: string, isSchool: boolean) {
    if (!selectedId || !detail) return;
    setModal({ stateId: selectedId, stateName: detail.state.name, type, label, isSchool });
  }

  return (
    <div className="flex h-full min-h-[70vh]">
      {/* ── Left panel: state list ─────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50/60 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">States</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {statesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : states.length === 0 ? (
            <p className="text-xs text-zinc-400 italic px-4 py-4">No states found.</p>
          ) : (
            <ul className="py-2">
              {states.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-start justify-between gap-2",
                      selectedId === s.id
                        ? "bg-[#085782]/10 text-[#085782] font-semibold"
                        : "text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className={cn(
                      "shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                      selectedId === s.id
                        ? "bg-[#085782]/20 text-[#085782]"
                        : "bg-zinc-200 text-zinc-500"
                    )}>
                      {s.participantCount.toLocaleString()}
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
        <StateStatsPanel
          detail={detail}
          loading={detailLoading}
          onContingentTypeClick={handleContingentTypeClick}
        />
      </main>

      {/* ── Contingent list modal ──────────────────────────────────────────── */}
      {modal && (
        <ContingentModal key={modal.stateId + modal.type} info={modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
