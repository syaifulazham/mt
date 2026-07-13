"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, Clock, Download, Loader2, RefreshCw,
  Users, Trophy, ChevronDown, ChevronUp, AlertCircle,
  FileSpreadsheet,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = {
  id: string; name: string; ic: string | null;
  gender: string; eduLevel: string; classGrade: string | null;
};

type Trainer = { id: string; name: string; phoneNumber: string | null };

type AcceptanceTeam = {
  teamEventId:     string;
  teamId:          string;
  teamName:        string;
  competitionCode: string;
  competitionName: string;
  contingentName:  string;
  acceptance:      string;
  members:         Member[];
  trainers:        Trainer[];
};

type AcceptanceEvent = {
  event: {
    id: string; name: string; slug: string; status: string;
    startDate: string | null; endDate: string | null; venue: string | null;
  };
  teams: AcceptanceTeam[];
};

type ReportTeam = {
  id: string; name: string; contingentName: string;
  competitionCode: string; competitionName: string;
  minTeamSize: number; maxTeamSize: number;
  members: { name: string; ic: string; gender: string; eduLevel: string; classGrade: string }[];
  trainers: { name: string; phoneNumber: string; email: string }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTANCE_OPTIONS = ["PENDING", "HOLD", "ACCEPT", "REJECT"] as const;

const ACCEPTANCE_STYLE: Record<string, { badge: string; btn: string }> = {
  PENDING: {
    badge: "bg-zinc-100 text-zinc-600 border-zinc-200",
    btn:   "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
  },
  HOLD: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    btn:   "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  },
  ACCEPT: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    btn:   "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
  REJECT: {
    badge: "bg-red-50 text-red-700 border-red-200",
    btn:   "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  },
};

const EVENT_STATUS_STYLE: Record<string, string> = {
  PUBLISHED:  "bg-blue-50 text-blue-700 border-blue-100",
  REG_OPEN:   "bg-green-50 text-green-700 border-green-100",
  REG_CLOSED: "bg-orange-50 text-orange-700 border-orange-100",
  ONGOING:    "bg-purple-50 text-purple-700 border-purple-100",
  COMPLETED:  "bg-zinc-100 text-zinc-500 border-zinc-200",
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

const GENDER_LABEL: Record<string, string> = { MALE: "L", FEMALE: "P" };
const EDU_LABEL: Record<string, string> = { PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia" };

// ── Team row with expandable members/trainers ─────────────────────────────────

function TeamRow({
  eventId, team, onAcceptanceChange,
}: {
  eventId: string;
  team: AcceptanceTeam;
  onAcceptanceChange: (teamEventId: string, teamId: string, eventId: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving,   setSaving]   = useState<string | null>(null);
  const st = ACCEPTANCE_STYLE[team.acceptance] ?? ACCEPTANCE_STYLE.PENDING;

  async function setAcceptance(value: string) {
    if (saving) return;
    setSaving(value);
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.teamId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptance: value }),
      });
      if (!res.ok) throw new Error("Gagal");
      onAcceptanceChange(team.teamEventId, team.teamId, eventId, value);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="border border-zinc-100 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 dark:border-zinc-800">
      {/* Team header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
              {team.competitionCode}
            </span>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
              {team.teamName}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.badge}`}>
              {team.acceptance}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">{team.competitionName}</p>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500 shrink-0">
          <Users className="h-3 w-3" />
          {team.members.length}
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0"
          title={expanded ? "Sembunyikan" : "Tunjukkan ahli"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Acceptance buttons */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-zinc-400 shrink-0">Kemaskini penerimaan:</span>
        {ACCEPTANCE_OPTIONS.map(opt => (
          <button
            key={opt}
            disabled={!!saving}
            onClick={() => setAcceptance(opt)}
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              team.acceptance === opt
                ? ACCEPTANCE_STYLE[opt].btn + " ring-1 ring-offset-1 ring-current"
                : "border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
            }`}
          >
            {saving === opt ? "…" : opt}
          </button>
        ))}
      </div>

      {/* Members & trainers */}
      {expanded && (
        <div className="border-t border-zinc-100 px-4 pb-3 pt-2 space-y-2 bg-zinc-50/50 dark:bg-zinc-800/30">
          {team.members.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-1">Ahli Pasukan</p>
              <div className="space-y-1">
                {team.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-5 text-center px-1 py-px rounded-full font-bold ${
                      m.gender === "MALE" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                    }`}>
                      {GENDER_LABEL[m.gender] ?? m.gender}
                    </span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 flex-1 truncate">{m.name}</span>
                    <span className="text-zinc-400 font-mono">{m.ic ?? "—"}</span>
                    <span className="text-zinc-400">{EDU_LABEL[m.eduLevel] ?? m.eduLevel}</span>
                    {m.classGrade && <span className="text-zinc-400">{m.classGrade}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {team.trainers.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-1">Jurulatih</p>
              <div className="space-y-1">
                {team.trainers.map((tr) => (
                  <div key={tr.id} className="flex items-center gap-2 text-[11px]">
                    <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 flex-1">{tr.name}</span>
                    {tr.phoneNumber && <span className="text-zinc-400">{tr.phoneNumber}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Event acceptance panel ────────────────────────────────────────────────────

function EventAcceptancePanel({ entry, onAcceptanceChange }: {
  entry: AcceptanceEvent;
  onAcceptanceChange: (teamEventId: string, teamId: string, eventId: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const st = EVENT_STATUS_STYLE[entry.event.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";

  const acceptanceCounts = ACCEPTANCE_OPTIONS.reduce((acc, opt) => {
    acc[opt] = entry.teams.filter(t => t.acceptance === opt).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden dark:border-zinc-700">
      {/* Event header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.event.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st}`}>
              {entry.event.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {(entry.event.startDate || entry.event.endDate) && (
              <span className="text-[11px] text-zinc-500">
                {fmtDate(entry.event.startDate)}
                {entry.event.endDate && entry.event.endDate !== entry.event.startDate
                  ? ` – ${fmtDate(entry.event.endDate)}`
                  : ""}
              </span>
            )}
            {entry.event.venue && (
              <span className="text-[11px] text-zinc-500">{entry.event.venue}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Summary pills */}
          {acceptanceCounts.ACCEPT  > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{acceptanceCounts.ACCEPT} ACCEPT</span>}
          {acceptanceCounts.HOLD    > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{acceptanceCounts.HOLD} HOLD</span>}
          {acceptanceCounts.REJECT  > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">{acceptanceCounts.REJECT} REJECT</span>}
          {acceptanceCounts.PENDING > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">{acceptanceCounts.PENDING} PENDING</span>}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </div>
      </button>

      {/* Teams list */}
      {open && (
        <div className="p-3 space-y-2 bg-white dark:bg-zinc-900">
          {entry.teams.map(team => (
            <TeamRow
              key={team.teamEventId}
              eventId={entry.event.id}
              team={team}
              onAcceptanceChange={onAcceptanceChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report download ───────────────────────────────────────────────────────────

async function downloadReport() {
  const res = await fetch("/api/v2/manager/dashboard/report");
  if (!res.ok) { alert("Gagal memuatkan data laporan."); return; }
  const { data, contingentName }: { data: ReportTeam[]; contingentName: string } = await res.json();
  if (!data?.length) { alert("Tiada pasukan untuk dijana laporan."); return; }

  const { utils, writeFile } = await import("xlsx");

  const wb = utils.book_new();

  // Group by competition
  const compMap = new Map<string, { code: string; name: string; teams: ReportTeam[] }>();
  for (const t of data) {
    const key = t.competitionCode;
    if (!compMap.has(key)) compMap.set(key, { code: t.competitionCode, name: t.competitionName, teams: [] });
    compMap.get(key)!.teams.push(t);
  }

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    [`LAPORAN SENARAI PASUKAN — ${contingentName.toUpperCase()}`],
    [],
    ["Pertandingan (Kod)", "Nama Pertandingan", "Bil. Pasukan", "Bil. Peserta", "Bil. Jurulatih"],
  ];
  for (const comp of compMap.values()) {
    const totalMembers  = comp.teams.reduce((s, t) => s + t.members.length, 0);
    const totalTrainers = comp.teams.reduce((s, t) => s + t.trainers.length, 0);
    summaryRows.push([comp.code, comp.name, comp.teams.length, totalMembers, totalTrainers]);
  }
  summaryRows.push([]);
  summaryRows.push(["", "", "JUMLAH",
    data.reduce((s, t) => s + t.members.length, 0),
    data.reduce((s, t) => s + t.trainers.length, 0),
  ]);

  const summaryWs = utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 18 }, { wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  utils.book_append_sheet(wb, summaryWs, "Ringkasan");

  // ── One sheet per competition ──────────────────────────────────────────────
  for (const comp of compMap.values()) {
    const rows: (string | number)[][] = [
      [`PERTANDINGAN: ${comp.code} — ${comp.name}`],
      [`Kontingen: ${contingentName}`],
      [],
    ];

    let teamNo = 1;
    for (const team of comp.teams) {
      rows.push([`#${teamNo++}`, `PASUKAN: ${team.name}`]);
      rows.push(["", "AHLI PASUKAN"]);
      rows.push(["", "Bil.", "Nama", "No. IC", "Jantina", "Tahap", "Gred"]);
      team.members.forEach((m, i) => {
        rows.push([
          "", i + 1,
          m.name,
          m.ic,
          m.gender === "MALE" ? "Lelaki" : m.gender === "FEMALE" ? "Perempuan" : m.gender,
          m.eduLevel === "PRIMARY" ? "Rendah" : m.eduLevel === "SECONDARY" ? "Menengah" : m.eduLevel,
          m.classGrade,
        ]);
      });
      if (team.members.length === 0) rows.push(["", "", "(Tiada ahli)"]);

      if (team.trainers.length > 0) {
        rows.push(["", "JURULATIH"]);
        rows.push(["", "Bil.", "Nama", "No. Telefon", "E-mel"]);
        team.trainers.forEach((tr, i) => {
          rows.push(["", i + 1, tr.name, tr.phoneNumber, tr.email]);
        });
      }
      rows.push([]);
    }

    const ws = utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 4 }, { wch: 6 }, { wch: 36 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];

    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = `${comp.code}`.slice(0, 31);
    utils.book_append_sheet(wb, ws, sheetName);
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  writeFile(wb, `laporan-pasukan-${stamp}.xlsx`);
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardAcceptanceSection() {
  const [events,       setEvents]       = useState<AcceptanceEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [downloading,  setDownloading]  = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/v2/manager/dashboard/acceptance")
      .then(r => r.json())
      .then(j => setEvents(j.data ?? []))
      .catch(() => setError("Gagal memuatkan data pengesahan acara."))
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleAcceptanceChange(teamEventId: string, _teamId: string, _eventId: string, value: string) {
    setEvents(prev => prev.map(entry => ({
      ...entry,
      teams: entry.teams.map(t =>
        t.teamEventId === teamEventId ? { ...t, acceptance: value } : t
      ),
    })));
  }

  async function handleDownload() {
    setDownloading(true);
    try { await downloadReport(); }
    finally { setDownloading(false); }
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold dark:text-zinc-100">Pengesahan Penyertaan Acara</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Senarai acara yang memerlukan pengesahan daripada pengurus kontinjen
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            title="Muat semula"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Muat Turun Laporan
          </button>
        </div>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3 border border-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm text-zinc-500">Tiada acara memerlukan pengesahan pada masa ini.</p>
        </div>
      )}

      {!loading && events.map(entry => (
        <EventAcceptancePanel
          key={entry.event.id}
          entry={entry}
          onAcceptanceChange={handleAcceptanceChange}
        />
      ))}

      {/* Pending counter */}
      {!loading && events.length > 0 && (() => {
        const pendingCount = events.flatMap(e => e.teams).filter(t => t.acceptance === "PENDING").length;
        if (pendingCount === 0) return null;
        return (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span><strong>{pendingCount} pasukan</strong> masih belum disahkan (PENDING).</span>
          </div>
        );
      })()}
    </div>
  );
}
