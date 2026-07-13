"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  CheckCircle2, Clock, Loader2, RefreshCw,
  Users, Trophy, ChevronDown, ChevronUp, AlertCircle,
  FileSpreadsheet, Check,
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

type ReportSchool = {
  name: string; code: string; level: string; category: string;
  district: string | null; zone: string | null; state: string | null;
};

type ReportInstitution = { name: string; state: string | null };

type ReportTeam = {
  teamId: string; teamName: string;
  competitionCode: string; competitionName: string;
  acceptance: string;
  members: { name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null }[];
  trainers: { name: string; phoneNumber: string | null; email: string | null }[];
};

type ReportEvent = {
  event: { id: string; name: string; startDate: string | null; endDate: string | null; venue: string | null };
  teams: ReportTeam[];
};

type ReportPayload = {
  contingentName: string;
  contingentType: string;
  school: ReportSchool | null;
  institution: ReportInstitution | null;
  events: ReportEvent[];
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


function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

const GENDER_LABEL: Record<string, string> = { MALE: "L", FEMALE: "P" };

const ACCEPTANCE_DOT: Record<string, string> = {
  PENDING: "bg-zinc-400",
  HOLD:    "bg-amber-500",
  ACCEPT:  "bg-emerald-500",
  REJECT:  "bg-red-500",
};

// ── Team table row with expandable members/trainers ───────────────────────────

function TeamTableRow({
  eventId, team, onAcceptanceChange, t,
}: {
  eventId: string;
  team: AcceptanceTeam;
  onAcceptanceChange: (teamEventId: string, teamId: string, eventId: string, value: string) => void;
  t: TFn;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [dropOpen,   setDropOpen]   = useState(false);
  const [dropCoords, setDropCoords] = useState({ top: 0, left: 0 });
  const dropRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const badge = ACCEPTANCE_STYLE[team.acceptance]?.badge ?? ACCEPTANCE_STYLE.PENDING.badge;

  useEffect(() => {
    if (!dropOpen) return;
    function onOutside(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setDropOpen(false);
    }
    function onScroll() { setDropOpen(false); }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [dropOpen]);

  function toggleDrop() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropCoords({ top: r.bottom + 4, left: r.left });
    }
    setDropOpen(v => !v);
  }

  async function choose(value: string) {
    if (saving || value === team.acceptance) { setDropOpen(false); return; }
    setSaving(true);
    setDropOpen(false);
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.teamId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptance: value }),
      });
      if (!res.ok) throw new Error("Gagal");
      onAcceptanceChange(team.teamEventId, team.teamId, eventId, value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
        {/* Code */}
        <td
          className="px-4 py-3 w-[1%] whitespace-nowrap cursor-pointer"
          onClick={() => setExpanded(v => !v)}
        >
          <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
            {team.competitionCode}
          </span>
        </td>

        {/* Name */}
        <td
          className="px-3 py-3 cursor-pointer"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="font-medium text-sm text-zinc-800 dark:text-zinc-100 leading-tight">{team.teamName}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{team.competitionCode} {team.competitionName}</div>
        </td>

        {/* Member count */}
        <td
          className="px-3 py-3 w-[1%] whitespace-nowrap text-center cursor-pointer"
          onClick={() => setExpanded(v => !v)}
        >
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Users className="h-3 w-3" />{team.members.length}
          </span>
        </td>

        {/* Acceptance dropdown */}
        <td className="px-3 py-3 w-[1%] whitespace-nowrap">
          <button
            ref={btnRef}
            onClick={toggleDrop}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-opacity disabled:opacity-50 hover:opacity-80 ${badge}`}
          >
            {saving
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
              : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ACCEPTANCE_DOT[team.acceptance] ?? "bg-zinc-400"}`} />}
            {team.acceptance}
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </button>

          {dropOpen && typeof document !== "undefined" && createPortal(
            <div
              ref={dropRef}
              style={{ position: "fixed", top: dropCoords.top, left: dropCoords.left, zIndex: 9999 }}
              className="w-40 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1"
            >
              {ACCEPTANCE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => choose(opt)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                    team.acceptance === opt ? "bg-zinc-50 dark:bg-zinc-800" : ""
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ACCEPTANCE_DOT[opt]}`} />
                  <span className={
                    opt === "ACCEPT" ? "text-emerald-700 dark:text-emerald-400" :
                    opt === "REJECT" ? "text-red-700 dark:text-red-400" :
                    opt === "HOLD"   ? "text-amber-700 dark:text-amber-400" :
                    "text-zinc-600 dark:text-zinc-300"
                  }>{opt}</span>
                  {team.acceptance === opt && <Check className="h-3 w-3 ml-auto text-zinc-400" />}
                </button>
              ))}
            </div>,
            document.body
          )}
        </td>

        {/* Expand toggle */}
        <td
          className="px-3 py-3 w-8 cursor-pointer text-zinc-400 hover:text-zinc-600 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </td>
      </tr>

      {/* Expanded: members & trainers */}
      {expanded && (
        <tr className="bg-zinc-50/70 dark:bg-zinc-800/30">
          <td colSpan={5} className="px-6 pt-2 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {team.members.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-1.5">{t("membersLabel")}</p>
                  <div className="space-y-1">
                    {team.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-5 text-center px-1 py-px rounded-full font-bold shrink-0 ${
                          m.gender === "MALE" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                        }`}>
                          {GENDER_LABEL[m.gender] ?? m.gender}
                        </span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 flex-1 truncate">{m.name}</span>
                        <span className="text-zinc-400 font-mono shrink-0">{m.ic ?? "—"}</span>
                        {m.classGrade && <span className="text-zinc-400 shrink-0">{m.classGrade}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {team.trainers.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-1.5">{t("trainersLabel")}</p>
                  <div className="space-y-1">
                    {team.trainers.map((tr) => (
                      <div key={tr.id} className="flex items-center gap-2 text-[11px]">
                        <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 flex-1">{tr.name}</span>
                        {tr.phoneNumber && <span className="text-zinc-400 shrink-0">{tr.phoneNumber}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Event acceptance panel ────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslations>;

function EventAcceptancePanel({ entry, onAcceptanceChange, t }: {
  entry: AcceptanceEvent;
  onAcceptanceChange: (teamEventId: string, teamId: string, eventId: string, value: string) => void;
  t: TFn;
}) {
  const [open, setOpen] = useState(true);

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
          {acceptanceCounts.ACCEPT  > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{acceptanceCounts.ACCEPT} ACCEPT</span>}
          {acceptanceCounts.HOLD    > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{acceptanceCounts.HOLD} HOLD</span>}
          {acceptanceCounts.REJECT  > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">{acceptanceCounts.REJECT} REJECT</span>}
          {acceptanceCounts.PENDING > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">{acceptanceCounts.PENDING} PENDING</span>}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </div>
      </button>

      {/* Teams table */}
      {open && (
        <div className="overflow-x-auto bg-white dark:bg-zinc-900">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colCode")}</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colTeam")}</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide text-center">{t("colMembers")}</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colAcceptance")}</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entry.teams.map(team => (
                <TeamTableRow
                  key={team.teamEventId}
                  eventId={entry.event.id}
                  team={team}
                  onAcceptanceChange={onAcceptanceChange}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Report download ───────────────────────────────────────────────────────────

const GENDER_FULL: Record<string, string> = { MALE: "Lelaki", FEMALE: "Perempuan" };
const ACCEPT_COLOR: Record<string, string> = { ACCEPT: "065F46", REJECT: "991B1B", HOLD: "92400E", PENDING: "374151" };
const ACCEPT_FILL:  Record<string, string> = { ACCEPT: "D1FAE5", REJECT: "FEE2E2", HOLD: "FEF3C7", PENDING: "F4F4F5" };

function fmtDateDoc(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" });
}

async function downloadReport() {
  const res = await fetch("/api/v2/manager/dashboard/report");
  if (!res.ok) { alert("Gagal memuatkan data laporan."); return; }
  const payload: ReportPayload & { data: null } = await res.json();
  if (!payload.events?.length) { alert("Tiada pasukan untuk dijana laporan."); return; }

  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
    AlignmentType, WidthType, ShadingType, BorderStyle,
    convertInchesToTwip,
  } = await import("docx");

  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const NAVY   = "1E3A5F";
  const DBLUE  = "1D4ED8";
  const LGREY  = "F8F9FA";
  const GREY   = "E5E7EB";
  const DGREY  = "6B7280";
  const WHITE  = "FFFFFF";
  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

  function hr(color = "CBD5E1") {
    return new Paragraph({
      spacing: { before: 80, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color } },
      children: [],
    });
  }

  function label(key: string, value: string) {
    return new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: key.padEnd(22, " "), font: "Calibri", size: 20, color: DGREY }),
        new TextRun({ text: ": ", font: "Calibri", size: 20, color: DGREY }),
        new TextRun({ text: value, font: "Calibri", size: 20, bold: true, color: "111827" }),
      ],
    });
  }

  function hCell(text: string, w?: number) {
    return new TableCell({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new TextRun({ text, font: "Calibri", bold: true, color: WHITE, size: 18 })] })],
      shading:  { type: ShadingType.CLEAR, fill: DBLUE, color: "auto" },
      borders:  { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      ...(w ? { width: { size: w, type: WidthType.DXA } } : {}),
    });
  }

  function dCell(text: string, fill = WHITE, align: string = AlignmentType.LEFT, bold = false, color?: string) {
    return new TableCell({
      children: [new Paragraph({ alignment: align as never, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: text ?? "—", font: "Calibri", size: 18, bold, color: color ?? "374151" })] })],
      shading:  { type: ShadingType.CLEAR, fill, color: "auto" },
      borders:  { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    });
  }

  function nCell(text: string, fill = WHITE) {
    return new TableCell({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new TextRun({ text, font: "Calibri", size: 18, color: "374151" })] })],
      shading:  { type: ShadingType.CLEAR, fill, color: "auto" },
      borders:  { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    });
  }

  function infoCell(text: string) {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, font: "Calibri", size: 20, color: "111827" })] })],
      borders:  { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    });
  }

  // ── Build document children ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  // Title block
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "LAPORAN PENYERTAAN ACARA", font: "Calibri", bold: true, size: 36, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: "MALAYSIA TECHLYMPICS 2026", font: "Calibri", size: 24, color: DBLUE })],
    }),
    hr(DBLUE),
    new Paragraph({ spacing: { after: 60 }, children: [] }),
  );

  // Contingent / school info table
  const infoRows: ReturnType<typeof infoRow>[] = [];

  function infoRow(key: string, value: string) {
    return new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: key, font: "Calibri", size: 20, color: DGREY, bold: true })] })], borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, width: { size: 2400, type: WidthType.DXA } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ":", font: "Calibri", size: 20, color: DGREY })] })], borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, width: { size: 200, type: WidthType.DXA } }),
      infoCell(value),
    ]});
  }

  infoRows.push(infoRow("Nama Kontinjen", payload.contingentName));
  if (payload.school) {
    infoRows.push(infoRow("Sekolah", payload.school.name));
    if (payload.school.district) infoRows.push(infoRow("Daerah", payload.school.district));
    if (payload.school.zone)     infoRows.push(infoRow("Zon",    payload.school.zone));
    if (payload.school.state)    infoRows.push(infoRow("Negeri", payload.school.state));
  } else if (payload.institution) {
    infoRows.push(infoRow("Institusi", payload.institution.name));
    if (payload.institution.state) infoRows.push(infoRow("Negeri", payload.institution.state));
  }
  infoRows.push(infoRow("Tarikh Dijana", generated));

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: infoRows,
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    }),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
  );

  // ── Summary table (top) ────────────────────────────────────────────────────
  const allTeams = payload.events.flatMap(e => e.teams);
  const compSummary = new Map<string, { code: string; name: string; teams: number; members: number; trainers: number }>();
  for (const t of allTeams) {
    const e = compSummary.get(t.competitionCode) ?? { code: t.competitionCode, name: t.competitionName, teams: 0, members: 0, trainers: 0 };
    e.teams++;
    e.members  += t.members.length;
    e.trainers += t.trainers.length;
    compSummary.set(t.competitionCode, e);
  }

  children.push(hr(NAVY));
  children.push(new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: "RINGKASAN", font: "Calibri", bold: true, size: 28, color: NAVY })],
  }));

  const summaryRows = [
    new TableRow({ children: [hCell("Kod"), hCell("Pertandingan"), hCell("Pasukan", 900), hCell("Peserta", 900), hCell("Jurulatih", 1100)] }),
    ...[...compSummary.values()].map((c, i) => {
      const shade = i % 2 === 0 ? WHITE : LGREY;
      return new TableRow({ children: [
        dCell(c.code, shade, AlignmentType.CENTER, true, DBLUE),
        dCell(c.name, shade),
        nCell(String(c.teams), shade),
        nCell(String(c.members), shade),
        nCell(String(c.trainers), shade),
      ]});
    }),
    new TableRow({ children: [
      new TableCell({
        columnSpan: 2,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "JUMLAH", font: "Calibri", bold: true, size: 20, color: NAVY })] })],
        shading: { type: ShadingType.CLEAR, fill: GREY, color: "auto" },
        borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      }),
      nCell(String(allTeams.length), GREY),
      nCell(String(allTeams.reduce((s, t) => s + t.members.length, 0)), GREY),
      nCell(String(allTeams.reduce((s, t) => s + t.trainers.length, 0)), GREY),
    ]}),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ── Per-event sections ─────────────────────────────────────────────────────
  for (const entry of payload.events) {
    const ev = entry.event;

    children.push(hr(NAVY));
    children.push(new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text: `ACARA: ${ev.name.toUpperCase()}`, font: "Calibri", bold: true, size: 28, color: NAVY })],
    }));

    const dateStr = ev.startDate
      ? ev.endDate && ev.endDate !== ev.startDate
        ? `${fmtDateDoc(ev.startDate)} – ${fmtDateDoc(ev.endDate)}`
        : fmtDateDoc(ev.startDate)
      : null;
    if (dateStr) children.push(label("Tarikh", dateStr));
    if (ev.venue) children.push(label("Tempat", ev.venue));
    children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

    // Group teams by competition
    const compMap = new Map<string, { code: string; name: string; teams: ReportTeam[] }>();
    for (const team of entry.teams) {
      if (!compMap.has(team.competitionCode)) {
        compMap.set(team.competitionCode, { code: team.competitionCode, name: team.competitionName, teams: [] });
      }
      compMap.get(team.competitionCode)!.teams.push(team);
    }

    for (const comp of compMap.values()) {
      // Competition heading
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          shading: { type: ShadingType.CLEAR, fill: LGREY, color: "auto" },
          border: { left: { style: BorderStyle.SINGLE, size: 24, color: DBLUE } },
          indent: { left: convertInchesToTwip(0.1) },
          children: [
            new TextRun({ text: `${comp.code}  `, font: "Calibri", bold: true, size: 22, color: DBLUE }),
            new TextRun({ text: comp.name, font: "Calibri", size: 22, color: "374151" }),
          ],
        }),
        new Paragraph({ spacing: { after: 40 }, children: [] }),
      );

      let teamNo = 1;
      for (const team of comp.teams) {
        const acceptFill  = ACCEPT_FILL[team.acceptance]  ?? ACCEPT_FILL.PENDING;
        const acceptColor = ACCEPT_COLOR[team.acceptance] ?? ACCEPT_COLOR.PENDING;

        // Team header row (2-col: name | acceptance)
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: [
              new TableCell({
                width: { size: 75, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [
                  new TextRun({ text: `${teamNo++}.  `, font: "Calibri", size: 20, color: DGREY }),
                  new TextRun({ text: team.teamName, font: "Calibri", bold: true, size: 22, color: "111827" }),
                ]})],
                shading: { type: ShadingType.CLEAR, fill: LGREY, color: "auto" },
                borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
              }),
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [
                  new TextRun({ text: `▪ ${team.acceptance}`, font: "Calibri", bold: true, size: 20, color: acceptColor }),
                ]})],
                shading: { type: ShadingType.CLEAR, fill: acceptFill, color: "auto" },
                borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
              }),
            ]})],
          }),
        );

        // Members table
        children.push(
          new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Ahli Pasukan", font: "Calibri", bold: true, size: 18, color: DGREY })] }),
        );

        if (team.members.length === 0) {
          children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: convertInchesToTwip(0.2) }, children: [new TextRun({ text: "(Tiada ahli didaftarkan)", font: "Calibri", size: 18, color: DGREY, italics: true })] }));
        } else {
          const memberRows = [
            new TableRow({ children: [hCell("Bil", 500), hCell("Nama"), hCell("No. IC", 1600), hCell("Jantina", 900), hCell("Gred", 1400)] }),
            ...team.members.map((m, i) => {
              const shade = i % 2 === 0 ? WHITE : LGREY;
              return new TableRow({ children: [
                nCell(String(i + 1), shade),
                dCell(m.name, shade),
                dCell(m.ic ?? "—", shade),
                dCell(GENDER_FULL[m.gender] ?? m.gender, shade),
                dCell(m.classGrade ?? "—", shade),
              ]});
            }),
          ];
          children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: memberRows }));
        }

        // Trainers table
        if (team.trainers.length > 0) {
          children.push(
            new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: "Jurulatih", font: "Calibri", bold: true, size: 18, color: DGREY })] }),
          );
          const trainerRows = [
            new TableRow({ children: [hCell("Bil", 500), hCell("Nama"), hCell("No. Telefon", 1600), hCell("E-mel", 2400)] }),
            ...team.trainers.map((tr, i) => {
              const shade = i % 2 === 0 ? WHITE : LGREY;
              return new TableRow({ children: [
                nCell(String(i + 1), shade),
                dCell(tr.name, shade),
                dCell(tr.phoneNumber ?? "—", shade),
                dCell(tr.email ?? "—", shade),
              ]});
            }),
          ];
          children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trainerRows }));
        }

        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
    }
  }

  // ── Pack and download ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1),
            right:  convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1.2),
          },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url; a.download = `laporan-penyertaan-${stamp}.docx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardAcceptanceSection() {
  const t = useTranslations("dashboard.acceptance");

  const [events,       setEvents]       = useState<AcceptanceEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [downloading,  setDownloading]  = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/v2/manager/dashboard/acceptance")
      .then(r => r.json())
      .then(j => setEvents(j.data ?? []))
      .catch(() => setError(t("loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleAcceptanceChange(teamEventId: string, _teamId: string, _eventId: string, value: string) {
    setEvents(prev => prev.map(entry => ({
      ...entry,
      teams: entry.teams.map(team =>
        team.teamEventId === teamEventId ? { ...team, acceptance: value } : team
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
          <h2 className="text-sm font-semibold dark:text-zinc-100">{t("title")}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            title={t("refresh")}
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
            {t("downloadBtn")}
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
          <p className="text-sm text-zinc-500">{t("empty")}</p>
        </div>
      )}

      {!loading && events.map(entry => (
        <EventAcceptancePanel
          key={entry.event.id}
          entry={entry}
          onAcceptanceChange={handleAcceptanceChange}
          t={t}
        />
      ))}

      {/* Pending counter */}
      {!loading && events.length > 0 && (() => {
        const pendingCount = events.flatMap(e => e.teams).filter(team => team.acceptance === "PENDING").length;
        if (pendingCount === 0) return null;
        return (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{t("pendingWarning", { count: pendingCount })}</span>
          </div>
        );
      })()}
    </div>
  );
}
