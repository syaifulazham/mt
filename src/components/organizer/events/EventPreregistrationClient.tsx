"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, ChevronLeft, ChevronRight, Users, BarChart2,
  ChevronDown, ChevronUp, FileSpreadsheet, FileText, Loader2, Trash2, Download, ListChecks,
  CheckSquare, Square, X, UserPlus, Settings,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { exportXlsx, exportDocx } from "@/lib/export/preregistrationStatsExport";

type Participant = {
  id: string;
  name: string;
  contingentName: string | null;
  classGrade: string | null;
  eduLevel: string;
  competitionCode: string;
  competitionName: string;
  teamName: string;
  stateName: string | null;
};

type Team = {
  id: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  members: number;
  selected: boolean;
  acceptance: string;
};

type Competition = {
  id: string;
  code: string;
  name: string;
};

type TargetGroup = {
  id: string;
  code: string;
  name: string;
};

type Trainer = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  contingentName: string | null;
  stateName: string | null;
  teams: number;
  participants: number;
  teamNames: string[];
};

type EventSummary = {
  id: string;
  name: string;
  slug: string;
  scope: string;
  zoneStates: { id: string; name: string }[];
  prerequisites: { prerequisite: { id: string; name: string; slug: string } }[];
};

type PrereqTeam = {
  id: string;
  name: string;
  contingentName: string | null;
  competitionCode: string | null;
  competitionName: string | null;
  members: number;
  alreadyRegistered: boolean;
};

type PrereqGroup = {
  id: string;
  name: string;
  teams: PrereqTeam[];
};

type StatsSummary = {
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};

type GradeStat = { eduLevel: string; classGrade: string; count: number };

type StateStat = {
  stateName:         string;
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};

type SearchTeam = {
  id: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  members: number;
  alreadyRegistered: boolean;
};

const PAGE_SIZE = 50;

// ── Stats panel ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function GenderPie({ male, female }: { male: number; female: number }) {
  const total = male + female;
  if (total === 0) return null;
  const data = [
    { name: "Lelaki", value: male },
    { name: "Perempuan", value: female },
  ];
  const mp = ((male / total) * 100).toFixed(1);
  const fp = ((female / total) * 100).toFixed(1);
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <p className="text-xs text-zinc-400 mb-1">Jantina</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" startAngle={90} endAngle={-270}>
              <Cell fill="#60a5fa" />
              <Cell fill="#f472b6" />
            </Pie>
            <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString("ms-MY") : String(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2 text-xs text-zinc-600">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-400 shrink-0" />
            <span>Lelaki</span>
            <span className="font-semibold ml-1">{male.toLocaleString()}</span>
            <span className="text-zinc-400">({mp}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-pink-400 shrink-0" />
            <span>Perempuan</span>
            <span className="font-semibold ml-1">{female.toLocaleString()}</span>
            <span className="text-zinc-400">({fp}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GradeSection({ title, color, items }: { title: string; color: string; items: GradeStat[] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${color}`}>{title}</p>
      <div className="space-y-0.5">
        {items.map((g) => (
          <div key={g.classGrade} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-28 shrink-0">{g.classGrade}</span>
            <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${Math.round((g.count / max) * 100)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-zinc-600 w-8 text-right">{g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeTable({ rows }: { rows: GradeStat[] }) {
  const primary   = rows.filter((r) => r.eduLevel === "PRIMARY");
  const secondary = rows.filter((r) => r.eduLevel === "SECONDARY");
  const youth     = rows.filter((r) => r.eduLevel === "YOUTH");
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 space-y-4">
      <p className="text-xs text-zinc-400">Peserta mengikut Gred</p>
      <GradeSection title="Sekolah Rendah (Darjah)" color="text-emerald-600" items={primary} />
      <GradeSection title="Sekolah Menengah (Tingkatan)" color="text-violet-600" items={secondary} />
      <GradeSection title="Belia / Lain" color="text-orange-600" items={youth} />
    </div>
  );
}

function StateTable({ rows }: { rows: StateStat[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100">
        <p className="text-xs text-zinc-400">Pecahan mengikut Negeri</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-3 py-2 font-semibold text-zinc-500">Negeri</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Konting.</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Rendah</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Menengah</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Pasukan</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Peserta</th>
              <th className="text-right px-3 py-2 font-semibold text-blue-500">L</th>
              <th className="text-right px-3 py-2 font-semibold text-pink-500">P</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.stateName} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                <td className="px-3 py-2 font-medium text-zinc-700">{r.stateName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.schoolContingents}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.primarySchools}</td>
                <td className="px-3 py-2 text-right tabular-nums text-violet-700">{r.secondarySchools}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.teams}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-800">{r.participants}</td>
                <td className="px-3 py-2 text-right tabular-nums text-blue-600">{r.male}</td>
                <td className="px-3 py-2 text-right tabular-nums text-pink-600">{r.female}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold">
              <td className="px-3 py-2 text-zinc-600">Jumlah</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.schoolContingents, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{rows.reduce((s, r) => s + r.primarySchools, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-violet-700">{rows.reduce((s, r) => s + r.secondarySchools, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.teams, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{rows.reduce((s, r) => s + r.participants, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-blue-700">{rows.reduce((s, r) => s + r.male, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-pink-700">{rows.reduce((s, r) => s + r.female, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventPreregistrationClient({ event }: { event: EventSummary }) {
  // Participants state
  const [rows, setRows]       = useState<Participant[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Teams state
  const [teams, setTeams]               = useState<Team[]>([]);
  const [teamsTotal, setTeamsTotal]     = useState(0);
  const [teamsPage, setTeamsPage]       = useState(1);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError]     = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [unregistering, setUnregistering] = useState(false);

  // Trainers state
  const [trainers, setTrainers]               = useState<Trainer[]>([]);
  const [trainersTotal, setTrainersTotal]     = useState(0);
  const [trainersPage, setTrainersPage]       = useState(1);
  const [trainersLoading, setTrainersLoading] = useState(false);
  const [trainersError, setTrainersError]     = useState<string | null>(null);

  // Unregister confirmation modal
  const [confirmModal, setConfirmModal] = useState<{ code: string; input: string } | null>(null);
  // Remove pending teams
  const [removePendingModal, setRemovePendingModal] = useState<{ code: string; input: string } | null>(null);
  const [removingPending, setRemovingPending] = useState(false);

  // Prerequisite tally check
  type PrereqCheckResult = {
    isTallied:      boolean;
    totalSelected:  number;
    totalRegistered: number;
    missing:        number;
    prerequisites:  { id: string; name: string; slug: string; selectedCount: number; registeredCount: number; missingCount: number }[];
  };
  const [prereqCheck, setPrereqCheck]           = useState<PrereqCheckResult | null>(null);
  const [prereqCheckDismissed, setPrereqCheckDismissed] = useState(false);
  const [loadingMissing, setLoadingMissing]     = useState(false);
  const [loadMissingResult, setLoadMissingResult] = useState<{ added: number } | null>(null);

  // Load-from-prerequisite modal
  type PrereqModalState =
    | { phase: "loading" }
    | { phase: "picking"; groups: PrereqGroup[]; selectedIds: Set<string> }
    | { phase: "saving" }
    | { phase: "success"; added: number; skipped: number }
    | { phase: "error"; message: string };
  const [prereqModal, setPrereqModal] = useState<PrereqModalState | null>(null);

  // Prerequisite state filter config
  const [prereqStateFilter, setPrereqStateFilter]           = useState<string[]>([]);
  const [pendingStateFilter, setPendingStateFilter]         = useState<string[]>([]);
  const [stateFilterSaving, setStateFilterSaving]           = useState(false);
  const [stateFilterError, setStateFilterError]             = useState("");
  const [showStateFilterConfig, setShowStateFilterConfig]   = useState(false);

  // Add-teams search modal
  type AddTeamsModalState =
    | { phase: "searching" }
    | { phase: "picking"; results: SearchTeam[]; selectedIds: Set<string>; searchQ: string; searchCompId: string }
    | { phase: "saving" }
    | { phase: "success"; added: number; skipped: number; ineligible: number }
    | { phase: "error"; message: string };
  const [addTeamsModal, setAddTeamsModal] = useState<AddTeamsModalState | null>(null);
  const [addSearchQ, setAddSearchQ] = useState("");
  const [addSearchCompId, setAddSearchCompId] = useState("");

  // List tab toggle
  const [listTab, setListTab] = useState<"participants" | "teams" | "trainers">("teams");

  // Filters (shared across tabs)
  const [q, setQ]                         = useState("");
  const [debouncedQ, setDebouncedQ]       = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [stateId, setStateId]             = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [states, setStates]             = useState<{ id: string; name: string }[]>([]);
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([]);

  // Stats panel
  const [statsOpen, setStatsOpen]       = useState(true);
  const [stats, setStats]               = useState<{
    summary: StatsSummary;
    byGrade: GradeStat[];
    byState: StateStat[];
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [exporting, setExporting]       = useState<"xlsx" | "docx" | null>(null);
  const [downloading, setDownloading]   = useState(false);

  // Select-all checkbox indeterminate ref (teams)
  const selectAllRef = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      if (listTab === "trainers") {
        // Server-side styled xlsx (exceljs) with merged cells + contingent colours
        const sp = new URLSearchParams();
        if (debouncedQ)    sp.set("q",             debouncedQ);
        if (competitionId) sp.set("competitionId", competitionId);
        if (stateId)       sp.set("stateId",       stateId);
        if (targetGroupId) sp.set("targetGroupId", targetGroupId);
        const res = await fetch(
          `/api/v2/organizer/events/${event.id}/preregistration/trainers/xlsx?${sp}`,
        );
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `pendaftaran-jurulatih-${event.slug}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const params = new URLSearchParams({ type: listTab });
      if (debouncedQ)    params.set("q", debouncedQ);
      if (competitionId) params.set("competitionId", competitionId);
      if (stateId)       params.set("stateId", stateId);
      if (targetGroupId) params.set("targetGroupId", targetGroupId);

      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const { data } = await res.json();

      const { utils, writeFile } = await import("xlsx");

      if (listTab === "participants") {
        const wsData = data.map((r: { id: string; name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null; contingentName: string | null; teamName: string; stateName: string | null; competitionCode: string; competitionName: string }) => ({
          "qr_code":      r.id              ?? "",
          "Nama":         r.name            ?? "",
          "IC":           r.ic              ?? "",
          "Jantina":      r.gender === "MALE" ? "Lelaki" : r.gender === "FEMALE" ? "Perempuan" : (r.gender ?? ""),
          "Tahap":        r.eduLevel        ?? "",
          "Gred/Kelas":   r.classGrade      ?? "",
          "Kontingen":    r.contingentName  ?? "",
          "Pasukan":      r.teamName        ?? "",
          "Negeri":       r.stateName       ?? "",
          "Pertandingan": `${r.competitionCode} — ${r.competitionName}`,
        }));
        const ws = utils.json_to_sheet(wsData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Peserta");
        writeFile(wb, `pendaftaran-peserta-${event.slug}.xlsx`);
      } else if (listTab === "teams") {
        const wsData = data.map((r: { teamName: string; contingentName: string | null; stateName: string | null; competitionCode: string; competitionName: string; members: number; memberNames: string }) => ({
          "Pasukan":      r.teamName        ?? "",
          "Kontingen":    r.contingentName  ?? "",
          "Negeri":       r.stateName       ?? "",
          "Pertandingan": `${r.competitionCode} — ${r.competitionName}`,
          "Jml Ahli":     r.members         ?? 0,
          "Nama Ahli":    r.memberNames     ?? "",
        }));
        const ws = utils.json_to_sheet(wsData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Pasukan");
        writeFile(wb, `pendaftaran-pasukan-${event.slug}.xlsx`);
      }
    } catch (e) {
      console.error("[download]", e);
      alert("Gagal memuat turun. Sila cuba lagi.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleExport(format: "xlsx" | "docx") {
    if (!stats) return;
    setExporting(format);
    try {
      if (format === "xlsx") exportXlsx(event.name, event.slug, stats);
      else                   await exportDocx(event.name, event.slug, stats);
    } finally {
      setExporting(null);
    }
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Load competitions from registered teams (not event_competitions — teams loaded via
  // prerequisite may not have event_competitions rows yet).
  useEffect(() => {
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/competitions`)
      .then((r) => r.json())
      .then((d) => {
        setCompetitions((d.data ?? []) as { id: string; code: string; name: string }[]);
      })
      .catch(() => {});
  }, [event.id]);

  // Load states
  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then((r) => r.json())
      .then((d) => setStates(d.data ?? []))
      .catch(() => {});
  }, []);

  // Load target groups present in this event's registered teams
  useEffect(() => {
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/target-groups`)
      .then((r) => r.json())
      .then((d) => setTargetGroups((d.data ?? []) as TargetGroup[]))
      .catch(() => {});
  }, [event.id]);

  // Load stats
  const loadStats = useCallback(() => {
    setStatsLoading(true);
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [event.id]);

  useEffect(() => { loadStats(); }, [loadStats]); // eslint-disable-line react-hooks/set-state-in-effect

  // Prerequisite tally check (only when event has prerequisites)
  useEffect(() => {
    if (!event.prerequisites?.length) return;
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/prerequisite-check`)
      .then((r) => r.json())
      .then((d) => setPrereqCheck(d))
      .catch(() => {});
  }, [event.id, event.prerequisites?.length]);

  // Load state filter config
  useEffect(() => {
    if (!event.prerequisites?.length) return;
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/state-filter`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => {
        const ids: string[] = j.stateIds ?? [];
        setPrereqStateFilter(ids);
        setPendingStateFilter(ids);
      })
      .catch(() => {});
  }, [event.id, event.prerequisites?.length]);

  // Load participants
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);
      if (targetGroupId) sp.set("targetGroupId", targetGroupId);

      const res  = await fetch(`/api/v2/organizer/events/${event.id}/preregistration?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [event.id, page, debouncedQ, competitionId, stateId, targetGroupId]);

  // Load teams
  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const sp = new URLSearchParams({ page: String(teamsPage), pageSize: String(PAGE_SIZE) });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);
      if (targetGroupId) sp.set("targetGroupId", targetGroupId);

      const res  = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/teams?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setTeams(json.data ?? []);
      setTeamsTotal(json.total ?? 0);
    } catch (e: unknown) {
      setTeamsError(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setTeamsLoading(false);
    }
  }, [event.id, teamsPage, debouncedQ, competitionId, stateId, targetGroupId]);

  // Load trainers
  const loadTrainers = useCallback(async () => {
    setTrainersLoading(true);
    setTrainersError(null);
    try {
      const sp = new URLSearchParams({ page: String(trainersPage), pageSize: String(PAGE_SIZE) });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);
      if (targetGroupId) sp.set("targetGroupId", targetGroupId);

      const res  = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/trainers?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setTrainers(json.data ?? []);
      setTrainersTotal(json.total ?? 0);
    } catch (e: unknown) {
      setTrainersError(e instanceof Error ? e.message : "Ralat tidak diketahui");
    } finally {
      setTrainersLoading(false);
    }
  }, [event.id, trainersPage, debouncedQ, competitionId, stateId, targetGroupId]);

  // Reset pages on filter change
  useEffect(() => { setPage(1); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setTeamsPage(1); setSelectedTeamIds(new Set()); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setTrainersPage(1); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { loadTeams(); }, [loadTeams]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { loadTrainers(); }, [loadTrainers]); // eslint-disable-line react-hooks/set-state-in-effect

  // Update select-all indeterminate state
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allIds = teams.map(t => t.id);
    const selectedCount = allIds.filter(id => selectedTeamIds.has(id)).length;
    selectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < allIds.length;
    selectAllRef.current.checked = allIds.length > 0 && selectedCount === allIds.length;
  }, [selectedTeamIds, teams]);

  function toggleTeam(id: string) {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllTeams() {
    const allIds = teams.map(t => t.id);
    const allSelected = allIds.every(id => selectedTeamIds.has(id));
    setSelectedTeamIds(allSelected ? new Set() : new Set(allIds));
  }

  function openUnregisterModal() {
    if (selectedTeamIds.size === 0) return;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setConfirmModal({ code, input: "" });
  }

  async function confirmUnregister() {
    if (!confirmModal || confirmModal.input !== confirmModal.code) return;
    setConfirmModal(null);
    setUnregistering(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/teams`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [...selectedTeamIds] }),
      });
      if (!res.ok) throw new Error("Ralat");
      setSelectedTeamIds(new Set());
      loadTeams();
      loadStats();
    } catch {
      alert("Gagal nyah-daftar. Sila cuba lagi.");
    } finally {
      setUnregistering(false);
    }
  }

  function openRemovePendingModal() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setRemovePendingModal({ code, input: "" });
  }

  async function confirmRemovePending() {
    if (!removePendingModal || removePendingModal.input !== removePendingModal.code) return;
    setRemovePendingModal(null);
    setRemovingPending(true);
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/teams`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptance: "PENDING" }),
      });
      if (!res.ok) throw new Error("Ralat");
      setSelectedTeamIds(new Set());
      loadTeams();
      loadStats();
    } catch {
      alert("Gagal membuang pasukan PENDING. Sila cuba lagi.");
    } finally {
      setRemovingPending(false);
    }
  }

  // Direct sync: load only the missing selected=true teams (no picker)
  async function handleLoadMissing() {
    setLoadingMissing(true);
    setLoadMissingResult(null);
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/load-from-prerequisite`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setLoadMissingResult({ added: json.added });
      loadTeams();
      loadStats();
      fetch(`/api/v2/organizer/events/${event.id}/preregistration/prerequisite-check`)
        .then((r) => r.json()).then((d) => setPrereqCheck(d)).catch(() => {});
    } catch {
      // leave banner open; user can retry
    } finally {
      setLoadingMissing(false);
    }
  }

  async function saveStateFilter() {
    setStateFilterSaving(true);
    setStateFilterError("");
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/state-filter`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stateIds: pendingStateFilter }),
        },
      );
      if (!res.ok) throw new Error("Gagal menyimpan konfigurasi");
      setPrereqStateFilter(pendingStateFilter);
      setShowStateFilterConfig(false);
    } catch (e) {
      setStateFilterError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setStateFilterSaving(false);
    }
  }

  // Step 1: fetch prerequisite teams and show picker
  async function handleLoadFromPrerequisite() {
    if (!event.prerequisites?.length) return;
    setPrereqModal({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/load-from-prerequisite`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      const groups: PrereqGroup[] = json.groups ?? [];
      // Pre-select all teams not yet registered
      const initialSelected = new Set<string>();
      for (const g of groups) {
        for (const t of g.teams) {
          if (!t.alreadyRegistered) initialSelected.add(t.id);
        }
      }
      setPrereqModal({ phase: "picking", groups, selectedIds: initialSelected });
    } catch (e: unknown) {
      setPrereqModal({ phase: "error", message: e instanceof Error ? e.message : "Gagal memuatkan senarai pasukan." });
    }
  }

  // Step 2: POST the chosen IDs
  async function handleConfirmLoad(selectedIds: Set<string>) {
    if (selectedIds.size === 0) return;
    setPrereqModal({ phase: "saving" });
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/load-from-prerequisite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds: [...selectedIds] }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      loadTeams();
      loadStats();
      setPrereqModal({ phase: "success", added: json.added, skipped: json.skipped });
      // Refresh the tally banner
      fetch(`/api/v2/organizer/events/${event.id}/preregistration/prerequisite-check`)
        .then((r) => r.json()).then((d) => setPrereqCheck(d)).catch(() => {});
    } catch (e: unknown) {
      setPrereqModal({ phase: "error", message: e instanceof Error ? e.message : "Gagal memuatkan daripada prasyarat." });
    }
  }

  async function toggleSelected(teamId: string, newValue: boolean) {
    // Optimistic update
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, selected: newValue } : t));
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/teams`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, selected: newValue }),
      });
      if (!res.ok) throw new Error("Ralat");
    } catch {
      // Revert on failure
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, selected: !newValue } : t));
    }
  }

  // Add-teams modal: open
  function openAddTeamsModal() {
    setAddSearchQ("");
    setAddSearchCompId("");
    setAddTeamsModal({ phase: "searching" });
  }

  // Add-teams modal: search
  async function handleAddTeamsSearch(searchQ: string, searchCompId: string) {
    if (searchQ.trim().length < 2) return;
    try {
      const sp = new URLSearchParams({ q: searchQ.trim() });
      if (searchCompId) sp.set("competitionId", searchCompId);
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/search-teams?${sp}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      const results: SearchTeam[] = json.data ?? [];
      setAddTeamsModal({
        phase: "picking",
        results,
        selectedIds: new Set<string>(),
        searchQ,
        searchCompId,
      });
    } catch (e: unknown) {
      setAddTeamsModal({ phase: "error", message: e instanceof Error ? e.message : "Gagal mencari pasukan." });
    }
  }

  // Add-teams modal: confirm add
  async function handleConfirmAddTeams(selectedIds: Set<string>) {
    if (selectedIds.size === 0) return;
    setAddTeamsModal({ phase: "saving" });
    try {
      const res = await fetch(
        `/api/v2/organizer/events/${event.id}/preregistration/add-teams`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds: [...selectedIds] }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ralat");
      setAddTeamsModal({ phase: "success", added: json.added, skipped: json.skipped, ineligible: json.ineligible });
      loadTeams();
      loadStats();
    } catch (e: unknown) {
      setAddTeamsModal({ phase: "error", message: e instanceof Error ? e.message : "Gagal menambah pasukan." });
    }
  }

  const selectedCount      = teams.filter(t => t.selected).length;
  const totalPages         = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const teamsTotalPages    = Math.max(1, Math.ceil(teamsTotal / PAGE_SIZE));
  const trainersTotalPages = Math.max(1, Math.ceil(trainersTotal / PAGE_SIZE));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href={`/organizer/events/${event.slug}/manage`}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Pra-Pendaftaran
          </h1>
          <p className="text-sm text-zinc-400">{event.name}</p>
        </div>
      </div>

      {/* Stats panel */}
      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <div className="flex items-center bg-zinc-50 border-b border-zinc-200">
          <button
            onClick={() => setStatsOpen((v) => !v)}
            className="flex-1 flex items-center gap-2 px-4 py-3 hover:bg-zinc-100 transition-colors text-sm font-semibold text-zinc-700 text-left"
          >
            <BarChart2 className="h-4 w-4 text-blue-500" />
            Statistik Penyertaan
            {statsOpen ? <ChevronUp className="h-4 w-4 text-zinc-400 ml-auto" /> : <ChevronDown className="h-4 w-4 text-zinc-400 ml-auto" />}
          </button>
          {stats && !statsLoading && (
            <div className="flex items-center gap-1.5 px-3 border-l border-zinc-200">
              <button
                onClick={() => handleExport("xlsx")}
                disabled={exporting !== null}
                title="Muat turun Excel (.xlsx)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors border border-emerald-200"
              >
                {exporting === "xlsx"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileSpreadsheet className="h-3.5 w-3.5" />}
                Excel
              </button>
              <button
                onClick={() => handleExport("docx")}
                disabled={exporting !== null}
                title="Muat turun Word (.docx)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors border border-blue-200"
              >
                {exporting === "docx"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileText className="h-3.5 w-3.5" />}
                Word
              </button>
            </div>
          )}
        </div>

        {statsOpen && (
          <div className="p-4 space-y-4 bg-zinc-50/30">
            {statsLoading || !stats ? (
              <p className="text-sm text-zinc-400 text-center py-4">Memuatkan statistik…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <StatCard label="Kontingen Sekolah"   value={stats.summary.schoolContingents} />
                  <StatCard label="Sekolah Rendah"      value={stats.summary.primarySchools} />
                  <StatCard label="Sekolah Menengah"    value={stats.summary.secondarySchools} />
                  <StatCard label="Pasukan"             value={stats.summary.teams} />
                  <StatCard label="Peserta"             value={stats.summary.participants} />
                  <StatCard label="Lelaki"              value={stats.summary.male} />
                  <StatCard label="Perempuan"           value={stats.summary.female} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GenderPie male={stats.summary.male} female={stats.summary.female} />
                  <GradeTable rows={stats.byGrade} />
                </div>

                <StateTable rows={stats.byState} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-0 border border-zinc-200 rounded-lg overflow-hidden w-fit">
        <button
          onClick={() => setListTab("participants")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            listTab === "participants"
              ? "bg-blue-600 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Peserta
        </button>
        <button
          onClick={() => setListTab("teams")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-l border-zinc-200 ${
            listTab === "teams"
              ? "bg-blue-600 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Pasukan
        </button>
        <button
          onClick={() => setListTab("trainers")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-l border-zinc-200 ${
            listTab === "trainers"
              ? "bg-blue-600 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Jurulatih
        </button>
      </div>

      {/* Filters */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            listTab === "participants"
              ? "Cari nama peserta atau pasukan…"
              : listTab === "teams"
                ? "Cari nama pasukan atau kontingen…"
                : "Cari nama, e-mel atau telefon jurulatih…"
          }
          className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        {targetGroups.length > 0 && (
          <select
            value={targetGroupId}
            onChange={(e) => setTargetGroupId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Semua Kumpulan Sasaran</option>
            {targetGroups.map((tg) => (
              <option key={tg.id} value={tg.id}>{tg.name}</option>
            ))}
          </select>
        )}

        {competitions.length > 0 && (
          <select
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Semua Pertandingan</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        )}

        {states.length > 0 && (
          <select
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Semua Negeri</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-zinc-400 ml-auto whitespace-nowrap">
          {listTab === "participants"
            ? (loading ? "Memuatkan…" : `${total} peserta`)
            : listTab === "teams"
              ? (teamsLoading ? "Memuatkan…" : `${teamsTotal} pasukan`)
              : (trainersLoading ? "Memuatkan…" : `${trainersTotal} jurulatih`)}
        </span>

        <button
          onClick={handleDownload}
          disabled={downloading}
          title={
            listTab === "participants"
              ? "Muat turun senarai peserta (.xlsx)"
              : listTab === "teams"
                ? "Muat turun senarai pasukan (.xlsx)"
                : "Muat turun senarai jurulatih (.xlsx)"
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors shrink-0"
        >
          {downloading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          {listTab === "participants" ? "Peserta" : listTab === "teams" ? "Pasukan" : "Jurulatih"}
        </button>

        {/* Bulk unregister (teams tab) */}
        {listTab === "teams" && selectedTeamIds.size > 0 && (
          <button
            onClick={openUnregisterModal}
            disabled={unregistering}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 border border-red-200 transition-colors"
          >
            {unregistering
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
            Nyah-daftar {selectedTeamIds.size} pasukan
          </button>
        )}

        {/* Remove all PENDING teams */}
        {listTab === "teams" && (
          <button
            onClick={openRemovePendingModal}
            disabled={removingPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 border border-amber-200 transition-colors"
            title="Buang semua pasukan dengan status PENDING"
          >
            {removingPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
            Buang Pending
          </button>
        )}

        {/* Load from prerequisite (teams tab) */}
        {listTab === "teams" && (event.prerequisites?.length ?? 0) > 0 && (
          <button
            onClick={handleLoadFromPrerequisite}
            disabled={prereqModal?.phase === "loading"}
            title={`Daftar pasukan terpilih dari acara prasyarat (${event.prerequisites!.map(p => p.prerequisite.name).join(", ")})`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 border border-indigo-200 transition-colors"
          >
            {prereqModal?.phase === "loading"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ListChecks className="h-3.5 w-3.5" />}
            Muat dari prasyarat
          </button>
        )}

        {/* State filter config toggle */}
        {listTab === "teams" && (event.prerequisites?.length ?? 0) > 0 && (
          <button
            onClick={() => { setPendingStateFilter(prereqStateFilter); setShowStateFilterConfig((v) => !v); }}
            title="Konfigurasi penapis negeri untuk muat dari prasyarat"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              prereqStateFilter.length > 0
                ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 border-zinc-200"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            {prereqStateFilter.length > 0 ? `${prereqStateFilter.length} negeri` : "Penapis negeri"}
          </button>
        )}

        {/* Add teams (teams tab) */}
        {listTab === "teams" && (
          <button
            onClick={openAddTeamsModal}
            title="Cari dan tambah pasukan ke acara ini"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-200 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Tambah Pasukan
          </button>
        )}
      </div>

      {/* State filter config panel */}
      {listTab === "teams" && showStateFilterConfig && (event.prerequisites?.length ?? 0) > 0 && (() => {
        const availableStates = event.zoneStates.length > 0 ? event.zoneStates : states;
        return (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-800">Penapis Negeri — Muat dari Prasyarat</p>
              <button onClick={() => setShowStateFilterConfig(false)} className="text-blue-400 hover:text-blue-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-blue-700">
              Pilih negeri yang dibenarkan apabila memuatkan pasukan dari prasyarat.
              Biarkan semua tidak ditanda untuk memuatkan semua negeri.
            </p>
            {availableStates.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">Memuatkan senarai negeri…</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {availableStates.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 hover:text-zinc-900">
                    <input
                      type="checkbox"
                      checked={pendingStateFilter.includes(s.id)}
                      onChange={(e) =>
                        setPendingStateFilter((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            {stateFilterError && <p className="text-xs text-red-600">{stateFilterError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveStateFilter}
                disabled={stateFilterSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {stateFilterSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                Simpan
              </button>
              <button
                onClick={() => { setPendingStateFilter(prereqStateFilter); setShowStateFilterConfig(false); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Batal
              </button>
              {pendingStateFilter.length > 0 && (
                <button
                  onClick={() => setPendingStateFilter([])}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-600 transition-colors ml-auto"
                >
                  Kosongkan pilihan
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* State filter active note */}
      {prereqStateFilter.length > 0 && (event.prerequisites?.length ?? 0) > 0 && !showStateFilterConfig && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700">
          <span className="text-blue-500">⚙</span>
          <span>
            Penapis negeri aktif: hanya <strong>{prereqStateFilter.length} negeri</strong> akan dimuatkan dari prasyarat.
          </span>
          <button
            onClick={() => { setPendingStateFilter(prereqStateFilter); setShowStateFilterConfig(true); }}
            className="ml-auto text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {/* Prerequisite tally banner */}
      {prereqCheck && !prereqCheck.isTallied && !prereqCheckDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-800">
              {prereqCheck.missing} pasukan dari acara prasyarat belum didaftarkan ke acara ini
            </p>
            <p className="text-amber-700 mt-0.5 text-xs">
              {prereqCheck.totalRegistered} daripada {prereqCheck.totalSelected} pasukan terpilih telah didaftarkan.
              Gunakan &ldquo;Muat dari prasyarat&rdquo; untuk melengkapkan senarai.
            </p>
            {prereqCheck.prerequisites.length > 1 && (
              <ul className="mt-2 space-y-0.5">
                {prereqCheck.prerequisites.map((p) => (
                  <li key={p.id} className="text-xs text-amber-700 flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${p.missingCount > 0 ? "bg-amber-400" : "bg-green-400"}`} />
                    <span className="font-medium">{p.name}:</span>
                    {p.missingCount === 0
                      ? <span className="text-green-700">lengkap ({p.registeredCount}/{p.selectedCount})</span>
                      : <span>{p.registeredCount}/{p.selectedCount} didaftarkan — <span className="font-semibold">{p.missingCount} belum</span></span>
                    }
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {loadMissingResult
              ? <span className="text-xs text-green-700 font-medium">{loadMissingResult.added} pasukan ditambah ✓</span>
              : (
                <button
                  onClick={handleLoadMissing}
                  disabled={loadingMissing}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium transition-colors"
                >
                  {loadingMissing && <Loader2 className="h-3 w-3 animate-spin" />}
                  Muat sekarang
                </button>
              )
            }
            <button
              onClick={() => setPrereqCheckDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors"
              title="Tutup"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {prereqCheck?.isTallied && (event.prerequisites?.length ?? 0) > 0 && !prereqCheckDismissed && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs text-green-700">
          <span className="text-green-500">✓</span>
          <span>Semua <strong>{prereqCheck.totalSelected} pasukan terpilih</strong> dari acara prasyarat telah didaftarkan.</span>
          <button onClick={() => setPrereqCheckDismissed(true)} className="ml-auto text-green-400 hover:text-green-600">✕</button>
        </div>
      )}

      {/* Error */}
      {(listTab === "participants" ? error : listTab === "teams" ? teamsError : trainersError) && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
          {listTab === "participants" ? error : listTab === "teams" ? teamsError : trainersError}
        </div>
      )}

      {/* Participants table */}
      {listTab === "participants" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Nama</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kontingen</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pasukan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Negeri</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pertandingan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-zinc-400 text-sm">Memuatkan…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-zinc-300 text-sm">Tiada data</td></tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{row.name}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.contingentName ?? "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.teamName}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.stateName ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {row.competitionCode}
                        </span>
                        <span className="text-zinc-600 text-xs">{row.competitionName}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Teams table */}
      {listTab === "teams" && (
        <>
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span className="font-semibold">{selectedCount} pasukan dipilih</span>
              <span className="text-emerald-500">untuk acara seterusnya</span>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      onChange={toggleAllTeams}
                      className="h-3.5 w-3.5 rounded border-zinc-300 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kontingen</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pasukan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Negeri</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pertandingan</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Ahli</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-violet-600 uppercase tracking-wide">Penerimaan</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-emerald-600 uppercase tracking-wide">Pilih</th>
                </tr>
              </thead>
              <tbody>
                {teamsLoading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-zinc-400 text-sm">Memuatkan…</td></tr>
                ) : teams.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-zinc-300 text-sm">Tiada data</td></tr>
                ) : (
                  teams.map((team, i) => {
                    const isChecked = selectedTeamIds.has(team.id);
                    return (
                      <tr
                        key={team.id}
                        onClick={() => toggleTeam(team.id)}
                        className={`cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-red-50/60"
                            : team.selected
                              ? "bg-emerald-50/40"
                              : i % 2 === 0 ? "bg-white hover:bg-zinc-50/60" : "bg-zinc-50/50 hover:bg-zinc-100/60"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTeam(team.id)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 accent-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">
                          {(teamsPage - 1) * PAGE_SIZE + i + 1}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600 text-xs">{team.contingentName ?? "–"}</td>
                        <td className="px-4 py-2.5 font-medium text-zinc-900">{team.teamName}</td>
                        <td className="px-4 py-2.5 text-zinc-500 text-xs">{team.stateName ?? "–"}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {team.competitionCode}
                            </span>
                            <span className="text-zinc-600 text-xs">{team.competitionName}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 text-xs">{team.members}</td>
                        <td className="px-4 py-2.5 text-center">
                          {(() => {
                            const a = team.acceptance ?? "PENDING";
                            const cls: Record<string, string> = {
                              PENDING: "bg-zinc-100 text-zinc-500 border-zinc-200",
                              HOLD:    "bg-amber-50 text-amber-700 border-amber-200",
                              ACCEPT:  "bg-emerald-50 text-emerald-700 border-emerald-200",
                              REJECT:  "bg-red-50 text-red-700 border-red-200",
                            };
                            return (
                              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls[a] ?? cls.PENDING}`}>
                                {a}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            role="switch"
                            aria-checked={team.selected}
                            onClick={() => toggleSelected(team.id, !team.selected)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                              team.selected ? "bg-emerald-500" : "bg-zinc-200"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                team.selected ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Trainers table */}
      {listTab === "trainers" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kontinjen</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Negeri</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Nama</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pasukan</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bil. Pasukan</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bil. Peserta</th>
              </tr>
            </thead>
            <tbody>
              {trainersLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-400 text-sm">Memuatkan…</td></tr>
              ) : trainers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-300 text-sm">Tiada data</td></tr>
              ) : (
                trainers.map((tr, i) => (
                  <tr key={tr.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">
                      {(trainersPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{tr.contingentName ?? "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{tr.stateName ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-zinc-900 text-sm">{tr.name}</div>
                      {tr.email && <div className="text-xs text-zinc-500 mt-0.5">{tr.email}</div>}
                      {tr.phoneNumber && <div className="text-xs text-zinc-400">{tr.phoneNumber}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">
                      {tr.teamNames.map((n) => (
                        <div key={n}>{n}</div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 text-xs">{tr.teams}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 text-xs">{tr.participants}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {listTab === "participants" && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">Halaman {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {listTab === "teams" && teamsTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">Halaman {teamsPage} / {teamsTotalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setTeamsPage((p) => Math.max(1, p - 1))}
              disabled={teamsPage === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button
              onClick={() => setTeamsPage((p) => Math.min(teamsTotalPages, p + 1))}
              disabled={teamsPage === teamsTotalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {listTab === "trainers" && trainersTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">Halaman {trainersPage} / {trainersTotalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setTrainersPage((p) => Math.max(1, p - 1))}
              disabled={trainersPage === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button
              onClick={() => setTrainersPage((p) => Math.min(trainersTotalPages, p + 1))}
              disabled={trainersPage === trainersTotalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Unregister confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-4.5 w-4.5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Sahkan Nyah-daftar</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedTeamIds.size} pasukan akan dikeluarkan dari acara ini. Tindakan ini tidak boleh dibatalkan.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-center space-y-1">
              <p className="text-xs text-zinc-400">Taip kod berikut untuk mengesahkan:</p>
              <p className="text-2xl font-bold tracking-[0.3em] text-zinc-900 font-mono select-all">{confirmModal.code}</p>
            </div>

            <input
              type="text"
              value={confirmModal.input}
              onChange={(e) => setConfirmModal(m => m ? { ...m, input: e.target.value.toUpperCase() } : null)}
              placeholder="Taip kod di sini…"
              maxLength={5}
              autoFocus
              className="w-full text-center text-lg font-mono tracking-[0.3em] border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 uppercase"
              onKeyDown={(e) => { if (e.key === "Enter" && confirmModal.input === confirmModal.code) confirmUnregister(); }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmUnregister}
                disabled={confirmModal.input !== confirmModal.code}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Nyah-daftar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Pending confirmation modal */}
      {removePendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                <Trash2 className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Buang Pasukan PENDING</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Semua pasukan dengan status penerimaan <span className="font-semibold text-amber-700">PENDING</span> akan dikeluarkan dari acara ini. Tindakan ini tidak boleh dibatalkan.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-center space-y-1">
              <p className="text-xs text-zinc-400">Taip kod berikut untuk mengesahkan:</p>
              <p className="text-2xl font-bold tracking-[0.3em] text-zinc-900 font-mono select-all">{removePendingModal.code}</p>
            </div>

            <input
              type="text"
              value={removePendingModal.input}
              onChange={(e) => setRemovePendingModal(m => m ? { ...m, input: e.target.value.toUpperCase() } : null)}
              placeholder="Taip kod di sini…"
              maxLength={5}
              autoFocus
              className="w-full text-center text-lg font-mono tracking-[0.3em] border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 uppercase"
              onKeyDown={(e) => { if (e.key === "Enter" && removePendingModal.input === removePendingModal.code) confirmRemovePending(); }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setRemovePendingModal(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmRemovePending}
                disabled={removePendingModal.input !== removePendingModal.code}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Buang Pending
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load-from-prerequisite modal */}
      {prereqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className={`bg-white rounded-2xl shadow-xl w-full mx-auto flex flex-col ${
            prereqModal.phase === "picking" ? "max-w-2xl max-h-[90vh]" : "max-w-sm"
          }`}>

            {/* Loading — fetching team list */}
            {prereqModal.phase === "loading" && (
              <div className="p-6 flex flex-col items-center gap-3 py-10">
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-900">Memuatkan senarai pasukan…</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Mengambil pasukan dari acara prasyarat</p>
                </div>
              </div>
            )}

            {/* Saving — registering selected teams */}
            {prereqModal.phase === "saving" && (
              <div className="p-6 flex flex-col items-center gap-3 py-10">
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-900">Mendaftarkan pasukan…</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Sila tunggu sebentar</p>
                </div>
              </div>
            )}

            {/* Picker */}
            {prereqModal.phase === "picking" && (() => {
              const { groups, selectedIds } = prereqModal;
              const allPickable = groups.flatMap(g => g.teams.filter(t => !t.alreadyRegistered).map(t => t.id));
              const allSelected = allPickable.length > 0 && allPickable.every(id => selectedIds.has(id));

              function toggleTeam(id: string) {
                setPrereqModal(prev => {
                  if (prev?.phase !== "picking") return prev;
                  const next = new Set(prev.selectedIds);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return { ...prev, selectedIds: next };
                });
              }

              function toggleAll() {
                setPrereqModal(prev => {
                  if (prev?.phase !== "picking") return prev;
                  const next = allSelected ? new Set<string>() : new Set(allPickable);
                  return { ...prev, selectedIds: next };
                });
              }

              function toggleGroup(g: PrereqGroup) {
                const groupPickable = g.teams.filter(t => !t.alreadyRegistered).map(t => t.id);
                const groupAllSel = groupPickable.every(id => selectedIds.has(id));
                setPrereqModal(prev => {
                  if (prev?.phase !== "picking") return prev;
                  const next = new Set(prev.selectedIds);
                  groupPickable.forEach(id => groupAllSel ? next.delete(id) : next.add(id));
                  return { ...prev, selectedIds: next };
                });
              }

              const totalTeams = groups.reduce((s, g) => s + g.teams.length, 0);

              return (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">Pilih Pasukan dari Prasyarat</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {totalTeams} pasukan ditemui · {selectedIds.size} dipilih
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleAll}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 hover:bg-zinc-50 transition-colors text-zinc-600"
                      >
                        {allSelected
                          ? <><CheckSquare className="h-3.5 w-3.5 text-indigo-600" /> Nyah-pilih Semua</>
                          : <><Square className="h-3.5 w-3.5" /> Pilih Semua</>}
                      </button>
                      <button onClick={() => setPrereqModal(null)} className="rounded-lg p-1.5 hover:bg-zinc-100 transition-colors">
                        <X className="h-4 w-4 text-zinc-500" />
                      </button>
                    </div>
                  </div>

                  {/* Team list */}
                  <div className="overflow-y-auto flex-1 divide-y">
                    {groups.map(g => {
                      const groupPickable = g.teams.filter(t => !t.alreadyRegistered);
                      const groupAllSel = groupPickable.length > 0 && groupPickable.every(t => selectedIds.has(t.id));
                      return (
                        <div key={g.id}>
                          {/* Group header */}
                          <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-50 border-b sticky top-0">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{g.name}</p>
                            {groupPickable.length > 0 && (
                              <button
                                onClick={() => toggleGroup(g)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                {groupAllSel ? "Nyah-pilih kumpulan" : "Pilih kumpulan"}
                              </button>
                            )}
                          </div>
                          {/* Teams */}
                          {g.teams.length === 0 ? (
                            <p className="px-5 py-3 text-xs text-zinc-400 italic">Tiada pasukan</p>
                          ) : g.teams.map(t => (
                            <label
                              key={t.id}
                              className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
                                t.alreadyRegistered
                                  ? "opacity-50 cursor-default bg-zinc-50"
                                  : selectedIds.has(t.id)
                                    ? "bg-indigo-50 hover:bg-indigo-100"
                                    : "hover:bg-zinc-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={t.alreadyRegistered || selectedIds.has(t.id)}
                                disabled={t.alreadyRegistered}
                                onChange={() => !t.alreadyRegistered && toggleTeam(t.id)}
                                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-900 truncate">{t.name}</p>
                                <p className="text-xs text-zinc-400 truncate">{t.contingentName ?? "—"}</p>
                              </div>
                              <div className="text-right shrink-0">
                                {t.competitionCode && (
                                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t.competitionCode}</span>
                                )}
                                <p className="text-xs text-zinc-400 mt-0.5">{t.members} ahli</p>
                              </div>
                              {t.alreadyRegistered && (
                                <span className="text-xs text-emerald-600 font-medium shrink-0">Sudah daftar</span>
                              )}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-t shrink-0">
                    <button
                      onClick={() => setPrereqModal(null)}
                      className="px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => handleConfirmLoad(selectedIds)}
                      disabled={selectedIds.size === 0}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ListChecks className="h-4 w-4" />
                      Muat {selectedIds.size} pasukan terpilih
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Success */}
            {prereqModal.phase === "success" && (
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Muat dari Prasyarat Berjaya</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {event.prerequisites?.map(p => p.prerequisite.name).join(", ")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-emerald-700">{prereqModal.added}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Pasukan didaftarkan</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-zinc-500">{prereqModal.skipped}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Sudah wujud</p>
                  </div>
                </div>
                {prereqModal.added === 0 && (
                  <p className="text-xs text-zinc-500 text-center">
                    Semua pasukan yang dipilih sudah didaftarkan ke acara ini.
                  </p>
                )}
                <button
                  onClick={() => setPrereqModal(null)}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Error */}
            {prereqModal.phase === "error" && (
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Gagal</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{prereqModal.message}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPrereqModal(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={handleLoadFromPrerequisite}
                    className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
                  >
                    Cuba Lagi
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Add-teams search modal */}
      {addTeamsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className={`bg-white rounded-2xl shadow-xl w-full mx-auto flex flex-col ${
            addTeamsModal.phase === "picking" ? "max-w-2xl max-h-[90vh]" : "max-w-sm"
          }`}>

            {/* Searching phase — search form */}
            {addTeamsModal.phase === "searching" && (
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Tambah Pasukan</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">Cari pasukan layak untuk ditambah ke acara ini</p>
                  </div>
                  <button onClick={() => setAddTeamsModal(null)} className="rounded-lg p-1.5 hover:bg-zinc-100 transition-colors">
                    <X className="h-4 w-4 text-zinc-500" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-600 block mb-1">Nama pasukan atau kontingen</label>
                    <input
                      type="text"
                      value={addSearchQ}
                      placeholder="Taipkan sekurang-kurangnya 2 aksara…"
                      onChange={(e) => setAddSearchQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTeamsSearch(addSearchQ, addSearchCompId); }}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      autoFocus
                    />
                  </div>
                  {competitions.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-zinc-600 block mb-1">Pertandingan (pilihan)</label>
                      <select
                        value={addSearchCompId}
                        onChange={(e) => setAddSearchCompId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
                      >
                        <option value="">Semua pertandingan acara ini</option>
                        {competitions.map((c) => (
                          <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAddTeamsModal(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleAddTeamsSearch(addSearchQ, addSearchCompId)}
                    disabled={addSearchQ.trim().length < 2}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" /> Cari
                  </button>
                </div>
              </div>
            )}

            {/* Saving */}
            {addTeamsModal.phase === "saving" && (
              <div className="p-6 flex flex-col items-center gap-3 py-10">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-900">Mendaftarkan pasukan…</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Sila tunggu sebentar</p>
                </div>
              </div>
            )}

            {/* Picking — search results */}
            {addTeamsModal.phase === "picking" && (() => {
              const { results, selectedIds, searchQ: lastQ } = addTeamsModal;
              const pickable = results.filter(t => !t.alreadyRegistered);
              const allSelected = pickable.length > 0 && pickable.every(t => selectedIds.has(t.id));

              function toggleTeam(id: string) {
                setAddTeamsModal(prev => {
                  if (prev?.phase !== "picking") return prev;
                  const next = new Set(prev.selectedIds);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return { ...prev, selectedIds: next };
                });
              }

              function toggleAll() {
                setAddTeamsModal(prev => {
                  if (prev?.phase !== "picking") return prev;
                  const pickableIds = prev.results.filter(t => !t.alreadyRegistered).map(t => t.id);
                  const next = allSelected ? new Set<string>() : new Set(pickableIds);
                  return { ...prev, selectedIds: next };
                });
              }

              return (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">Hasil Carian</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {results.length} pasukan ditemui · {selectedIds.size} dipilih
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAddTeamsModal({ phase: "searching" })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 hover:bg-zinc-50 transition-colors text-zinc-600"
                      >
                        <Search className="h-3.5 w-3.5" /> Cari lagi
                      </button>
                      {pickable.length > 0 && (
                        <button
                          onClick={toggleAll}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 hover:bg-zinc-50 transition-colors text-zinc-600"
                        >
                          {allSelected
                            ? <><CheckSquare className="h-3.5 w-3.5 text-emerald-600" /> Nyah-pilih Semua</>
                            : <><Square className="h-3.5 w-3.5" /> Pilih Semua</>}
                        </button>
                      )}
                      <button onClick={() => setAddTeamsModal(null)} className="rounded-lg p-1.5 hover:bg-zinc-100 transition-colors">
                        <X className="h-4 w-4 text-zinc-500" />
                      </button>
                    </div>
                  </div>

                  {/* Results list */}
                  <div className="overflow-y-auto flex-1 divide-y">
                    {results.length === 0 ? (
                      <p className="px-5 py-8 text-sm text-zinc-400 text-center">
                        Tiada pasukan layak ditemui untuk &ldquo;{lastQ}&rdquo;
                      </p>
                    ) : results.map(t => (
                      <label
                        key={t.id}
                        className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
                          t.alreadyRegistered
                            ? "opacity-50 cursor-default bg-zinc-50"
                            : selectedIds.has(t.id)
                              ? "bg-emerald-50 hover:bg-emerald-100"
                              : "hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={t.alreadyRegistered || selectedIds.has(t.id)}
                          disabled={t.alreadyRegistered}
                          onChange={() => !t.alreadyRegistered && toggleTeam(t.id)}
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{t.teamName}</p>
                          <p className="text-xs text-zinc-400 truncate">{t.contingentName ?? "—"} · {t.stateName ?? "—"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t.competitionCode}</span>
                          <p className="text-xs text-zinc-400 mt-0.5">{t.members} ahli</p>
                        </div>
                        {t.alreadyRegistered && (
                          <span className="text-xs text-emerald-600 font-medium shrink-0">Sudah daftar</span>
                        )}
                      </label>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-t shrink-0">
                    <button
                      onClick={() => setAddTeamsModal(null)}
                      className="px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => handleConfirmAddTeams(selectedIds)}
                      disabled={selectedIds.size === 0}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="h-4 w-4" />
                      Tambah {selectedIds.size} pasukan
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Success */}
            {addTeamsModal.phase === "success" && (
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Pasukan Berjaya Ditambah</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Pasukan telah didaftarkan ke acara ini.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-emerald-700">{addTeamsModal.added}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Ditambah</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-zinc-500">{addTeamsModal.skipped}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Sudah wujud</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-amber-600">{addTeamsModal.ineligible}</p>
                    <p className="text-xs text-amber-500 mt-0.5">Tidak layak</p>
                  </div>
                </div>
                <button
                  onClick={() => setAddTeamsModal(null)}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Error */}
            {addTeamsModal.phase === "error" && (
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                    <X className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Gagal</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{addTeamsModal.message}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddTeamsModal(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={openAddTeamsModal}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
                  >
                    Cuba Lagi
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
