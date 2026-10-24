import type { QuizzlyMonitorCompetition, QuizzlyMonitorRow } from "@/lib/quizzlyMonitor";

// Asia Spark Quizzes → XLSX (client-side, ExcelJS): one sheet per competition,
// the registered participants listed quiz by quiz, each quiz with its own
// header, ranked nationally and within the state.

/**
 * MT-side ranking of one quiz: submitted attempts by percentage (desc), then
 * the shorter attempt; equal on both share a rank (1, 1, 3). Unsubmitted
 * participants are unranked. Shared by the page and the export.
 */
export function rankQuizRows(list: QuizzlyMonitorRow[]): Map<string, number> {
  const dur = (r: QuizzlyMonitorRow) => r.durationMs ?? Number.MAX_SAFE_INTEGER;
  const done = list.filter(r => r.status === "submitted" && r.score)
    .sort((a, b) => (b.score!.percentage - a.score!.percentage) || (dur(a) - dur(b)));
  const ranks = new Map<string, number>();
  done.forEach((r, i) => {
    const prev = done[i - 1];
    const tied = prev && prev.score!.percentage === r.score!.percentage && dur(prev) === dur(r);
    ranks.set(r.participantId, tied ? ranks.get(prev.participantId)! : i + 1);
  });
  return ranks;
}

/** Ranks within each state ("—" = no state). */
export function rankQuizRowsByState(list: QuizzlyMonitorRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const states = new Set(list.map(r => r.stateName ?? "—"));
  for (const s of states) rankQuizRows(list.filter(r => (r.stateName ?? "—") === s)).forEach((v, k) => out.set(k, v));
  return out;
}

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Selesai", in_progress: "Sedang menjawab", logged_in: "Log masuk",
  not_started: "Belum mula", voided: "Dibatalkan", no_code: "Tiada kod",
};
const STATUS_ORDER = ["submitted", "in_progress", "logged_in", "not_started", "voided", "no_code"];

// ARGB colours
const C = {
  brand:      "FFEA580C", // orange-600
  brandDark:  "FF9A3412", // orange-800
  brandSoft:  "FFFFEDD5", // orange-100
  brandLine:  "FFFDBA74", // orange-300
  head:       "FF3F3F46", // zinc-700
  white:      "FFFFFFFF",
  zebra:      "FFFAFAFA",
  line:       "FFE4E4E7", // zinc-200
  muted:      "FF71717A", // zinc-500
  gold:       "FFFDE68A", silver: "FFE4E4E7", bronze: "FFFED7AA",
};
const STATUS_FILL: Record<string, { fg: string; bg: string }> = {
  submitted:   { fg: "FF047857", bg: "FFD1FAE5" },
  in_progress: { fg: "FF0369A1", bg: "FFE0F2FE" },
  logged_in:   { fg: "FF4338CA", bg: "FFE0E7FF" },
  not_started: { fg: "FF52525B", bg: "FFF4F4F5" },
  voided:      { fg: "FFBE123C", bg: "FFFFE4E6" },
  no_code:     { fg: "FFB45309", bg: "FFFEF3C7" },
};

const FONT = "Calibri";
const COLS: { header: string; width: number; align?: "left" | "center" | "right" }[] = [
  { header: "Kdd. Kebangsaan", width: 10, align: "center" },
  { header: "Kdd. Negeri",     width: 9,  align: "center" },
  { header: "Nama Peserta",    width: 34 },
  { header: "Darjah",          width: 10, align: "center" },
  { header: "Kontingen",       width: 40 },
  { header: "Negeri",          width: 18 },
  { header: "Status",          width: 15, align: "center" },
  { header: "Dijawab",         width: 9,  align: "center" },
  { header: "Markah",          width: 8,  align: "right" },
  { header: "Maks",            width: 7,  align: "right" },
  { header: "%",               width: 8,  align: "right" },
  { header: "Tempoh",          width: 10, align: "right" },
  { header: "Dihantar",        width: 18, align: "center" },
];

function fmtDuration(ms: number | null) {
  if (ms == null) return "";
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}j ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}
function fmtWhen(d: string | null) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
}
function sheetName(code: string, used: Set<string>) {
  const base = code.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Pertandingan";
  let name = base, i = 2;
  while (used.has(name)) name = `${base.slice(0, 28)} (${i++})`;
  used.add(name);
  return name;
}

export type QuizRowsLoader = (ecId: string, quizId: string) => Promise<QuizzlyMonitorRow[]>;

export async function exportQuizzlyResultsExcel({ eventName, competitions, load, onProgress }: {
  eventName: string;
  competitions: QuizzlyMonitorCompetition[];
  load: QuizRowsLoader;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  // Load every quiz first, four at a time
  const jobs = competitions.flatMap(c => c.quizzes.map(q => ({ ecId: c.ecId, quizId: q.id })));
  const rowsByKey = new Map<string, QuizzlyMonitorRow[]>();
  let done = 0;
  onProgress?.(0, jobs.length);
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      rowsByKey.set(`${job.ecId}:${job.quizId}`, await load(job.ecId, job.quizId));
      onProgress?.(++done, jobs.length);
    }
  }));

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Techlympics";
  wb.created = new Date();
  const used = new Set<string>();
  const generated = new Date().toLocaleString("ms-MY", { dateStyle: "long", timeStyle: "short" });
  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const last = COLS.length;

  for (const comp of competitions) {
    const ws = wb.addWorksheet(sheetName(comp.code, used), {
      views: [{ state: "frozen", ySplit: 3 }],
      properties: { tabColor: { argb: C.brand } },
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    ws.columns = COLS.map(c => ({ width: c.width }));

    // Title block
    ws.mergeCells(1, 1, 1, last);
    const t = ws.getCell(1, 1);
    t.value = `${comp.code}  ${comp.name}`;
    t.font = { name: FONT, size: 15, bold: true, color: { argb: C.white } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, last);
    const sub = ws.getCell(2, 1);
    sub.value = `${eventName}${comp.sessionTitle ? `  ·  Sesi Quizzly: ${comp.sessionTitle}` : ""}  ·  ${comp.registered} peserta berdaftar  ·  Dijana ${generated}`;
    sub.font = { name: FONT, size: 10, italic: true, color: { argb: C.brandDark } };
    sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
    sub.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(2).height = 18;

    ws.mergeCells(3, 1, 3, last);
    const note = ws.getCell(3, 1);
    note.value = "Kedudukan: peratus tertinggi dahulu, kemudian tempoh terpendek. Hanya percubaan yang telah dihantar diberi kedudukan.";
    note.font = { name: FONT, size: 9, color: { argb: C.muted } };
    note.alignment = { indent: 1 };

    let r = 5;
    for (const quiz of comp.quizzes) {
      const rows = rowsByKey.get(`${comp.ecId}:${quiz.id}`) ?? [];
      const national = rankQuizRows(rows);
      const byState = rankQuizRowsByState(rows);
      const submitted = rows.filter(x => x.status === "submitted").length;
      const sorted = [...rows].sort((a, b) =>
        (national.get(a.participantId) ?? Number.MAX_SAFE_INTEGER) - (national.get(b.participantId) ?? Number.MAX_SAFE_INTEGER)
        || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || (a.stateName ?? "").localeCompare(b.stateName ?? "")
        || a.name.localeCompare(b.name));

      // Quiz header
      ws.mergeCells(r, 1, r, last);
      const qh = ws.getCell(r, 1);
      qh.value = {
        richText: [
          { text: quiz.title, font: { name: FONT, size: 12, bold: true, color: { argb: C.brandDark } } },
          ...(quiz.label ? [{ text: `   (${quiz.label})`, font: { name: FONT, size: 10, color: { argb: C.muted } } }] : []),
          { text: `   —   ${rows.length} berdaftar · ${submitted} selesai`, font: { name: FONT, size: 10, color: { argb: C.brandDark } } },
        ],
      };
      qh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
      qh.alignment = { vertical: "middle", indent: 1 };
      qh.border = { top: { style: "medium", color: { argb: C.brandLine } }, bottom: { style: "thin", color: { argb: C.brandLine } } };
      ws.getRow(r).height = 22;
      r++;

      // Column headers
      const hr = ws.getRow(r);
      COLS.forEach((c, i) => {
        const cell = hr.getCell(i + 1);
        cell.value = c.header;
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.head } };
        cell.alignment = { horizontal: c.align ?? "left", vertical: "middle", wrapText: true };
        cell.border = border;
      });
      hr.height = 20;
      r++;

      if (sorted.length === 0) {
        ws.mergeCells(r, 1, r, last);
        const e = ws.getCell(r, 1);
        e.value = "Tiada peserta berdaftar untuk kuiz ini.";
        e.font = { name: FONT, size: 10, italic: true, color: { argb: C.muted } };
        e.alignment = { horizontal: "center" };
        r += 2;
        continue;
      }

      sorted.forEach((x, i) => {
        const nr = national.get(x.participantId);
        const sr = byState.get(x.participantId);
        const row = ws.getRow(r);
        row.values = [
          nr ?? "", sr ?? "", x.name, x.classGrade ?? "", x.contingentName, x.stateName ?? "",
          STATUS_LABEL[x.status] ?? x.status,
          x.totalQuestions ? `${x.answered}/${x.totalQuestions}` : "",
          x.score?.raw ?? "", x.score?.max ?? "",
          x.score ? x.score.percentage / 100 : "",
          fmtDuration(x.durationMs), fmtWhen(x.submittedAt),
        ];
        const zebra = i % 2 === 1 ? C.zebra : C.white;
        const podium = nr === 1 ? C.gold : nr === 2 ? C.silver : nr === 3 ? C.bronze : null;
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col > last) return;
          cell.font = { name: FONT, size: 10 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
          cell.alignment = { horizontal: COLS[col - 1].align ?? "left", vertical: "middle" };
          cell.border = border;
        });
        if (podium) {
          for (const col of [1, 3]) {
            const c = row.getCell(col);
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: podium } };
            c.font = { name: FONT, size: 10, bold: true };
          }
        }
        const st = STATUS_FILL[x.status];
        if (st) {
          const c = row.getCell(7);
          c.font = { name: FONT, size: 10, bold: true, color: { argb: st.fg } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: st.bg } };
        }
        row.getCell(11).numFmt = "0.0%";
        if (x.score) row.getCell(11).font = { name: FONT, size: 10, bold: true };
        r++;
      });
      r++; // gap between quizzes
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `asia-spark-quizzes-${eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
