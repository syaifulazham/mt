"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, ChevronLeft, ChevronRight, BarChart2,
  ChevronDown, ChevronUp, Download, Loader2, CheckCircle2, Clock,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Team = {
  id: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  members: number;
  attendedAt: string | null;
};

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

type Competition = { id: string; code: string; name: string };
type TargetGroup = { id: string; code: string; name: string };

type EventSummary = { id: string; name: string; slug: string };

type StatsSummary = {
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
  teamsAttended:     number;
};

type GradeStat  = { eduLevel: string; classGrade: string; count: number };
type StateStat  = {
  stateName: string; schoolContingents: number; primarySchools: number;
  secondarySchools: number; teams: number; participants: number;
  male: number; female: number; teamsAttended: number;
};

const PAGE_SIZE = 50;

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-zinc-100 bg-white"}`}>
      <p className={`text-xs mb-0.5 ${highlight ? "text-emerald-600" : "text-zinc-400"}`}>{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? "text-emerald-700" : "text-zinc-900"}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function GenderPie({ male, female }: { male: number; female: number }) {
  const total = male + female;
  if (total === 0) return null;
  const data = [{ name: "Lelaki", value: male }, { name: "Perempuan", value: female }];
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
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Pasukan</th>
              <th className="text-right px-3 py-2 font-semibold text-zinc-500">Peserta</th>
              <th className="text-right px-3 py-2 font-semibold text-emerald-600">Hadir</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.stateName} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                <td className="px-3 py-2 font-medium text-zinc-700">{r.stateName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.schoolContingents}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{r.teams}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-800">{r.participants}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{r.teamsAttended}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold">
              <td className="px-3 py-2 text-zinc-600">Jumlah</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.schoolContingents, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{rows.reduce((s, r) => s + r.teams, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900">{rows.reduce((s, r) => s + r.participants, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{rows.reduce((s, r) => s + r.teamsAttended, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ms-MY", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function EventAttendanceConfirmedClient({ event }: { event: EventSummary }) {
  const [listTab, setListTab]   = useState<"participants" | "teams" | "trainers">("teams");
  const [q, setQ]               = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [stateId, setStateId]   = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [states, setStates]     = useState<{ id: string; name: string }[]>([]);
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([]);

  // Stats
  const [statsOpen, setStatsOpen]   = useState(true);
  const [stats, setStats]           = useState<{ summary: StatsSummary; byGrade: GradeStat[]; byState: StateStat[] } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Teams
  const [teams, setTeams]       = useState<Team[]>([]);
  const [teamsTotal, setTeamsTotal] = useState(0);
  const [teamsPage, setTeamsPage]   = useState(1);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Participants
  const [rows, setRows]         = useState<Participant[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Trainers
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainersTotal, setTrainersTotal] = useState(0);
  const [trainersPage, setTrainersPage]   = useState(1);
  const [trainersLoading, setTrainersLoading] = useState(false);
  const [trainersError, setTrainersError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/competitions`)
      .then(r => r.json()).then(d => setCompetitions(d.data ?? [])).catch(() => {});
  }, [event.id]);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then(r => r.json()).then(d => setStates(d.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/v2/organizer/events/${event.id}/preregistration/target-groups`)
      .then(r => r.json()).then(d => setTargetGroups(d.data ?? [])).catch(() => {});
  }, [event.id]);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    fetch(`/api/v2/organizer/events/${event.id}/attendance/confirmed/stats`)
      .then(r => r.json()).then(d => setStats(d)).catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [event.id]);

  useEffect(() => { loadStats(); }, [loadStats]); // eslint-disable-line react-hooks/set-state-in-effect

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const sp = new URLSearchParams({ page: String(teamsPage), pageSize: String(PAGE_SIZE) });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);
      if (targetGroupId) sp.set("targetGroupId", targetGroupId);
      const res  = await fetch(`/api/v2/organizer/events/${event.id}/attendance/confirmed?${sp}`);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), acceptance: "ACCEPT" });
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

  const loadTrainers = useCallback(async () => {
    setTrainersLoading(true);
    setTrainersError(null);
    try {
      const sp = new URLSearchParams({ page: String(trainersPage), pageSize: String(PAGE_SIZE), acceptance: "ACCEPT" });
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

  useEffect(() => { setPage(1); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setTeamsPage(1); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setTrainersPage(1); }, [debouncedQ, competitionId, stateId, targetGroupId]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { loadTeams(); }, [loadTeams]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { loadTrainers(); }, [loadTrainers]); // eslint-disable-line react-hooks/set-state-in-effect

  async function toggleAttendance(team: Team) {
    setToggling(team.id);
    try {
      const method = team.attendedAt ? "DELETE" : "POST";
      const res = await fetch(`/api/v2/organizer/events/${event.id}/attendance/log`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id }),
      });
      if (!res.ok) throw new Error("Ralat");
      // Optimistic update
      setTeams(prev => prev.map(t =>
        t.id === team.id ? { ...t, attendedAt: method === "POST" ? new Date().toISOString() : null } : t,
      ));
      loadStats();
    } catch {
      alert("Gagal mengemaskini kehadiran. Sila cuba lagi.");
    } finally {
      setToggling(null);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const sp = new URLSearchParams({ acceptance: "ACCEPT" });
      if (debouncedQ)    sp.set("q", debouncedQ);
      if (competitionId) sp.set("competitionId", competitionId);
      if (stateId)       sp.set("stateId", stateId);
      if (targetGroupId) sp.set("targetGroupId", targetGroupId);

      const type = listTab === "participants" ? "participants" : listTab === "teams" ? "teams" : "trainers";
      const params = new URLSearchParams({ type, ...Object.fromEntries(sp) });

      if (listTab === "trainers") {
        const res = await fetch(
          `/api/v2/organizer/events/${event.id}/preregistration/trainers/xlsx?${sp}`,
        );
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `disahkan-jurulatih-${event.slug}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const res = await fetch(`/api/v2/organizer/events/${event.id}/preregistration/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const { data } = await res.json();
      const { utils, writeFile } = await import("xlsx");

      if (listTab === "participants") {
        const wsData = data.map((r: { id: string; name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null; contingentName: string | null; teamName: string; stateName: string | null; competitionCode: string; competitionName: string }) => ({
          "qr_code":      r.id,
          "Nama":         r.name,
          "IC":           r.ic ?? "",
          "Jantina":      r.gender === "MALE" ? "Lelaki" : r.gender === "FEMALE" ? "Perempuan" : (r.gender ?? ""),
          "Tahap":        r.eduLevel,
          "Gred/Kelas":   r.classGrade ?? "",
          "Kontingen":    r.contingentName ?? "",
          "Pasukan":      r.teamName,
          "Negeri":       r.stateName ?? "",
          "Pertandingan": `${r.competitionCode} — ${r.competitionName}`,
        }));
        const ws = utils.json_to_sheet(wsData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Peserta");
        writeFile(wb, `disahkan-peserta-${event.slug}.xlsx`);
      } else {
        const wsData = data.map((r: { teamName: string; contingentName: string | null; stateName: string | null; competitionCode: string; competitionName: string; members: number; memberNames: string }) => ({
          "Pasukan":      r.teamName,
          "Kontingen":    r.contingentName ?? "",
          "Negeri":       r.stateName ?? "",
          "Pertandingan": `${r.competitionCode} — ${r.competitionName}`,
          "Jml Ahli":     r.members,
          "Nama Ahli":    r.memberNames ?? "",
        }));
        const ws = utils.json_to_sheet(wsData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Pasukan");
        writeFile(wb, `disahkan-pasukan-${event.slug}.xlsx`);
      }
    } catch {
      alert("Gagal memuat turun. Sila cuba lagi.");
    } finally {
      setDownloading(false);
    }
  }

  const totalPages         = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const teamsTotalPages    = Math.max(1, Math.ceil(teamsTotal / PAGE_SIZE));
  const trainersTotalPages = Math.max(1, Math.ceil(trainersTotal / PAGE_SIZE));

  const currentError = listTab === "participants" ? error : listTab === "teams" ? teamsError : trainersError;

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
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Pendaftaran Telah Disahkan
          </h1>
          <p className="text-sm text-zinc-400">{event.name}</p>
        </div>
      </div>

      {/* Stats panel */}
      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <button
          onClick={() => setStatsOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200 hover:bg-zinc-100 transition-colors text-sm font-semibold text-zinc-700 text-left"
        >
          <BarChart2 className="h-4 w-4 text-emerald-500" />
          Statistik Penyertaan Disahkan
          {statsOpen ? <ChevronUp className="h-4 w-4 text-zinc-400 ml-auto" /> : <ChevronDown className="h-4 w-4 text-zinc-400 ml-auto" />}
        </button>

        {statsOpen && (
          <div className="p-4 space-y-4 bg-zinc-50/30">
            {statsLoading || !stats ? (
              <p className="text-sm text-zinc-400 text-center py-4">Memuatkan statistik…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <StatCard label="Kontingen"       value={stats.summary.schoolContingents} />
                  <StatCard label="Sekolah Rendah"  value={stats.summary.primarySchools} />
                  <StatCard label="Sekolah Menengah" value={stats.summary.secondarySchools} />
                  <StatCard label="Pasukan (ACCEPT)" value={stats.summary.teams} />
                  <StatCard label="Peserta"          value={stats.summary.participants} />
                  <StatCard label="Lelaki"           value={stats.summary.male} />
                  <StatCard label="Perempuan"        value={stats.summary.female} />
                  <StatCard label="Pasukan Hadir"    value={stats.summary.teamsAttended} highlight />
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{stats.summary.teamsAttended}</span> dari{" "}
                    <span className="font-semibold">{stats.summary.teams}</span> pasukan telah daftar hadir
                    {stats.summary.teams > 0 && (
                      <span className="text-emerald-500 ml-1">
                        ({Math.round((stats.summary.teamsAttended / stats.summary.teams) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GenderPie male={stats.summary.male} female={stats.summary.female} />
                </div>

                <StateTable rows={stats.byState} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-0 border border-zinc-200 rounded-lg overflow-hidden w-fit">
        {(["participants", "teams", "trainers"] as const).map((tab, i) => (
          <button
            key={tab}
            onClick={() => setListTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l border-zinc-200" : ""} ${
              listTab === tab ? "bg-blue-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {tab === "participants" ? "Peserta" : tab === "teams" ? "Pasukan" : "Jurulatih"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
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
          <select value={targetGroupId} onChange={e => setTargetGroupId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white">
            <option value="">Semua Kumpulan Sasaran</option>
            {targetGroups.map(tg => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
          </select>
        )}
        {competitions.length > 0 && (
          <select value={competitionId} onChange={e => setCompetitionId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white">
            <option value="">Semua Pertandingan</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        )}
        {states.length > 0 && (
          <select value={stateId} onChange={e => setStateId(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white">
            <option value="">Semua Negeri</option>
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <span className="text-xs text-zinc-400 ml-auto whitespace-nowrap">
          {listTab === "participants"
            ? (loading ? "Memuatkan…" : `${total} peserta`)
            : listTab === "teams"
              ? (teamsLoading ? "Memuatkan…" : `${teamsTotal} pasukan`)
              : (trainersLoading ? "Memuatkan…" : `${trainersTotal} jurulatih`)}
        </span>

        <button onClick={handleDownload} disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors shrink-0">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {listTab === "participants" ? "Peserta" : listTab === "teams" ? "Pasukan" : "Jurulatih"}
        </button>
      </div>

      {currentError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{currentError}</div>
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
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{row.name}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.contingentName ?? "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{row.teamName}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.stateName ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{row.competitionCode}</span>
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
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kontingen</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pasukan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Negeri</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pertandingan</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Ahli</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-emerald-600 uppercase tracking-wide">Kehadiran</th>
              </tr>
            </thead>
            <tbody>
              {teamsLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-400 text-sm">Memuatkan…</td></tr>
              ) : teams.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-300 text-sm">Tiada data</td></tr>
              ) : (
                teams.map((team, i) => (
                  <tr key={team.id} className={`transition-colors ${
                    team.attendedAt ? "bg-emerald-50/40" : i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"
                  }`}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">{(teamsPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{team.contingentName ?? "–"}</td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{team.teamName}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{team.stateName ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{team.competitionCode}</span>
                        <span className="text-zinc-600 text-xs">{team.competitionName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 text-xs">{team.members}</td>
                    <td className="px-4 py-2.5 text-center">
                      {team.attendedAt ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Hadir
                          </span>
                          <span className="text-[9px] text-zinc-400 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" /> {fmtTime(team.attendedAt)}
                          </span>
                          <button
                            onClick={() => toggleAttendance(team)}
                            disabled={toggling === team.id}
                            className="text-[9px] text-red-400 hover:text-red-600 underline disabled:opacity-50"
                          >
                            {toggling === team.id ? "…" : "Undo"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleAttendance(team)}
                          disabled={toggling === team.id}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded-full border border-zinc-200 hover:border-emerald-200 transition-colors disabled:opacity-50"
                        >
                          {toggling === team.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : "Belum"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Trainers table */}
      {listTab === "trainers" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kontingen</th>
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
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">{(trainersPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{tr.contingentName ?? "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{tr.stateName ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-zinc-900 text-sm">{tr.name}</div>
                      {tr.email && <div className="text-xs text-zinc-500 mt-0.5">{tr.email}</div>}
                      {tr.phoneNumber && <div className="text-xs text-zinc-400">{tr.phoneNumber}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{tr.teamNames.map(n => <div key={n}>{n}</div>)}</td>
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {listTab === "teams" && teamsTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">Halaman {teamsPage} / {teamsTotalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setTeamsPage(p => Math.max(1, p - 1))} disabled={teamsPage === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button onClick={() => setTeamsPage(p => Math.min(teamsTotalPages, p + 1))} disabled={teamsPage === teamsTotalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {listTab === "trainers" && trainersTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400 text-xs">Halaman {trainersPage} / {trainersTotalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setTrainersPage(p => Math.max(1, p - 1))} disabled={trainersPage === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelum
            </button>
            <button onClick={() => setTrainersPage(p => Math.min(trainersTotalPages, p + 1))} disabled={trainersPage === trainersTotalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Seterusnya <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
