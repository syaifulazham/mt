import ExcelJS from "exceljs";
import {
  attendanceListNote, LIST_MODE_LABEL, type AttendanceListData, type CompetitionGroup, type Tally,
} from "@/lib/reports/attendanceListData";

// Senarai Kehadiran Penyertaan as Excel, in the form's layout:
// Bil | Kod Sekolah | Sekolah | Negeri/Negara | Jantina (L, P) |
// Bangsa (Melayu, Cina, India, Lain-lain) | Jumlah (Murid, Guru).
// • single — one sheet: the summary by competition, then every competition's
//   table one under another;
// • multi  — a "Ringkasan" sheet, then one sheet per competition.

export type XlsxLayout = "single" | "multi";

const HEAD = "FFE2E8F0";
const FOOT = "FFF1F5F9";
const TITLE = "FF0F172A";
const thin = { style: "thin" as const, color: { argb: "FF94A3B8" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const TALLY_HEAD = ["L", "P", "Melayu", "Cina", "India", "Lain-lain", "Murid", "Guru"];
const COL_WIDTHS = [6, 14, 46, 22, 7, 7, 9, 8, 8, 10, 9, 8];

const tallyValues = (t: Tally) => [t.male, t.female, t.melayu, t.cina, t.india, t.lain, t.murid, t.guru];

function styleRange(ws: ExcelJS.Worksheet, row: number, from: number, to: number, o: {
  fill?: string; bold?: boolean; center?: boolean; numbersFrom?: number;
}) {
  for (let c = from; c <= to; c++) {
    const cell = ws.getCell(row, c);
    cell.border = BORDER;
    cell.font = { name: "Arial", size: 10, bold: o.bold };
    if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    const centered = o.center || (o.numbersFrom !== undefined && c >= o.numbersFrom);
    cell.alignment = { vertical: "middle", horizontal: centered ? "center" : "left", wrapText: true };
  }
}

/** The form's two-row header at `row`; `lead` are the four leading columns. */
function header(ws: ExcelJS.Worksheet, row: number, lead: string[]) {
  lead.forEach((t, i) => {
    ws.getCell(row, i + 1).value = t.toUpperCase();
    ws.mergeCells(row, i + 1, row + 1, i + 1);
  });
  const groups: [string, number, number][] = [["JANTINA", 5, 6], ["BANGSA", 7, 10], ["JUMLAH", 11, 12]];
  for (const [t, a, b] of groups) {
    ws.getCell(row, a).value = t;
    ws.mergeCells(row, a, row, b);
  }
  TALLY_HEAD.forEach((t, i) => { ws.getCell(row + 1, 5 + i).value = t.toUpperCase(); });
  styleRange(ws, row, 1, 12, { fill: HEAD, bold: true, center: true });
  styleRange(ws, row + 1, 1, 12, { fill: HEAD, bold: true, center: true });
  return row + 2;
}

function title(ws: ExcelJS.Worksheet, row: number, text: string, size = 12) {
  ws.getCell(row, 1).value = text;
  ws.getCell(row, 1).font = { name: "Arial", size, bold: true, color: { argb: TITLE } };
  ws.mergeCells(row, 1, row, 12);
  return row + 1;
}

function note(ws: ExcelJS.Worksheet, row: number, text: string, height = 15) {
  ws.getCell(row, 1).value = text;
  ws.getCell(row, 1).font = { name: "Arial", size: 9, italic: true, color: { argb: "FF64748B" } };
  ws.getCell(row, 1).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(row, 1, row, 12);
  ws.getRow(row).height = height;
  return row + 1;
}

function setup(ws: ExcelJS.Worksheet) {
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
}

/** Event title, mode, snapshot time and the totals line. */
function masthead(ws: ExcelJS.Worksheet, d: AttendanceListData, row: number) {
  const asAt = new Date(d.generatedAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
  row = title(ws, row, "SENARAI KEHADIRAN PENYERTAAN", 10);
  row = title(ws, row, d.eventName.toUpperCase(), 14);
  row = note(ws, row,
    `Pertandingan ${LIST_MODE_LABEL[d.mode]} · Snapshot data setakat ${asAt}` +
    (d.mode === "BERSEMUKA" ? ` · Asas kehadiran: ${d.basis === "individual" ? "Individu" : "Kaunter"}` : ""));
  const f = (v: number) => v.toLocaleString("en-MY");
  row = title(ws, row,
    `${d.groups.length} pertandingan · ${f(d.total.schools)} sekolah / kontinjen · ${f(d.total.murid)} penyertaan murid · ` +
    `${f(d.total.guru)} guru · ${f(d.total.internationalMurid)} murid antarabangsa`, 10);
  return row + 1;
}

function summaryTable(ws: ExcelJS.Worksheet, d: AttendanceListData, row: number) {
  row = title(ws, row, "RINGKASAN MENGIKUT PERTANDINGAN", 11);
  row = header(ws, row, ["Bil", "Kod", "Pertandingan", "Sekolah"]);
  d.groups.forEach((g, i) => {
    ws.getRow(row).values = [i + 1, g.code, g.walkIn ? `${g.name} (Walk-in)` : g.name, g.rows.length, ...tallyValues(g.total)];
    styleRange(ws, row, 1, 12, { numbersFrom: 4 });
    ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
    row++;
  });
  ws.getRow(row).values = ["JUMLAH", "", "", d.groups.reduce((s, g) => s + g.rows.length, 0), ...tallyValues(d.total)];
  ws.mergeCells(row, 1, row, 3);
  styleRange(ws, row, 1, 12, { fill: FOOT, bold: true, numbersFrom: 4 });
  ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
  row++;
  return note(ws, row, attendanceListNote(d), 42);
}

function competitionTable(ws: ExcelJS.Worksheet, g: CompetitionGroup, index: number, row: number) {
  row = title(ws, row, `${index}. ${g.code} ${g.name}${g.walkIn ? " (Walk-in)" : ""}`.toUpperCase(), 11);
  row = note(ws, row, `${g.rows.length} sekolah · ${g.total.murid} murid · ${g.total.guru} guru`);
  const first = row;
  row = header(ws, row, ["Bil", "Kod Sekolah", "Sekolah", "Negeri / Negara"]);
  g.rows.forEach((r, i) => {
    ws.getRow(row).values = [i + 1, r.schoolCode ?? "–", r.name, r.international ? `${r.region} (Antarabangsa)` : r.region, ...tallyValues(r)];
    styleRange(ws, row, 1, 12, { numbersFrom: 5 });
    ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
    row++;
  });
  ws.getRow(row).values = ["JUMLAH", "", "", "", ...tallyValues(g.total)];
  ws.mergeCells(row, 1, row, 4);
  styleRange(ws, row, 1, 12, { fill: FOOT, bold: true, numbersFrom: 5 });
  ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
  return { next: row + 2, headerRow: first };
}

/** Excel sheet names: ≤ 31 chars, no []:*?/\ and unique. */
function sheetName(code: string, name: string, used: Set<string>) {
  const base = `${code} ${name}`.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) { const sfx = ` (${i++})`; n = base.slice(0, 31 - sfx.length) + sfx; }
  used.add(n.toLowerCase());
  return n;
}

export async function buildAttendanceListXlsx(d: AttendanceListData, layout: XlsxLayout): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Techlympics";
  wb.created = new Date();

  if (layout === "single") {
    const ws = wb.addWorksheet("Senarai Kehadiran");
    setup(ws);
    let row = masthead(ws, d, 1);
    row = summaryTable(ws, d, row) + 1;
    d.groups.forEach((g, i) => {
      ws.getRow(row).addPageBreak(); // each competition starts on a new printed page
      row = competitionTable(ws, g, i + 1, row + 1).next;
    });
  } else {
    const used = new Set<string>(["ringkasan"]);
    const ws = wb.addWorksheet("Ringkasan");
    setup(ws);
    summaryTable(ws, d, masthead(ws, d, 1));
    d.groups.forEach((g, i) => {
      const s = wb.addWorksheet(sheetName(g.code, g.name, used));
      setup(s);
      const top = title(s, 1, d.eventName.toUpperCase(), 10);
      const { headerRow } = competitionTable(s, g, i + 1, top);
      s.views = [{ state: "frozen", ySplit: headerRow + 1 }];
      s.pageSetup.printTitlesRow = `${headerRow}:${headerRow + 1}`;
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
