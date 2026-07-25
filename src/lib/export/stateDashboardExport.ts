import ExcelJS from "exceljs";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip, VerticalAlign,
} from "docx";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StateExportData = {
  state: { name: string; code?: string | null };
  stats: {
    totalParticipation:       number;
    totalContingents:         number;
    totalManagers:            number;
    primaryContingents:       number;
    secondaryContingents:     number;
    higherContingents:        number;
    independentContingents:   number;
    internationalContingents: number;
  };
  charts: {
    byGender:        { label: string; count: number }[];
    byEthnicity:     { label: string; count: number }[];
    byPpd:           { label: string; count: number }[];
    bySchoolCategory:{ label: string; count: number }[];
  };
};

// ── Shared ────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function n(v: number)               { return v.toLocaleString("ms-MY"); }
function pct(v: number, total: number) {
  return total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0.0%";
}
function pctNum(v: number, total: number) {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}
function slug(name: string)         { return name.replace(/\s+/g, "-"); }

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL  (exceljs — corporate theme + data bars)
// ═══════════════════════════════════════════════════════════════════════════════

const XL = {
  DARK:    "FF085782",   // primary brand dark blue
  MID:     "FF1D6EA5",   // medium blue for sub-headers
  ACCENT:  "FF0EA5E9",   // sky-500 for data bars
  MALE:    "FF1D4ED8",   // blue-700 for male
  FEMALE:  "FFDB2777",   // pink-600 for female
  HEADER:  "FFFFFFFF",   // white text
  LIGHT:   "FFD1E9F5",   // very light blue tint
  ALT:     "FFF8FAFC",   // alternating row
  WHITE:   "FFFFFFFF",
  GREY:    "FFE2E8F0",
  TEXT:    "FF1F2937",
  SUBTEXT: "FF6B7280",
};

type XlFill   = ExcelJS.Fill;
type XlFont   = Partial<ExcelJS.Font>;
type XlBorder = Partial<ExcelJS.Borders>;
type XlAlign  = Partial<ExcelJS.Alignment>;

function solidFill(argb: string): XlFill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function borderAll(argb = "FFD1D5DB"): XlBorder {
  const b = { style: "thin" as ExcelJS.BorderStyle, color: { argb } };
  return { top: b, bottom: b, left: b, right: b };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: { fill?: string; font?: XlFont; align?: XlAlign; border?: boolean },
) {
  if (opts.fill)   cell.fill   = solidFill(opts.fill);
  if (opts.font)   cell.font   = opts.font;
  if (opts.align)  cell.alignment = opts.align;
  if (opts.border) cell.border = borderAll();
}

/** Merges a row across `cols` columns, applies a title style. Returns the cell. */
function xlTitle(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: number,
  text: string,
  fill: string,
  size = 14,
  height = 28,
): ExcelJS.Cell {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  styleCell(cell, {
    fill,
    font:  { bold: true, color: { argb: XL.HEADER }, size, name: "Calibri" },
    align: { horizontal: "center", vertical: "middle" },
  });
  ws.getRow(row).height = height;
  return cell;
}

/** Column header row */
function xlColHeaders(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    styleCell(cell, {
      fill:   XL.MID,
      font:   { bold: true, color: { argb: XL.HEADER }, size: 10, name: "Calibri" },
      align:  { horizontal: i === 0 ? "left" : "center", vertical: "middle" },
      border: true,
    });
  });
  ws.getRow(row).height = 20;
}

/** Single data row with alternating bg */
function xlDataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: (string | number)[],
  isAlt: boolean,
  rightAlignFrom = 1,
) {
  const fill = isAlt ? XL.ALT : XL.WHITE;
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    cell.fill  = solidFill(fill);
    cell.font  = { size: 10, color: { argb: XL.TEXT }, name: "Calibri" };
    cell.alignment = { horizontal: i >= rightAlignFrom ? "right" : "left", vertical: "middle" };
    cell.border    = borderAll();
  });
  ws.getRow(row).height = 18;
}

/** Totals / summary row */
function xlTotalRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[]) {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    styleCell(cell, {
      fill:   XL.DARK,
      font:   { bold: true, color: { argb: XL.HEADER }, size: 10, name: "Calibri" },
      align:  { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
      border: true,
    });
  });
  ws.getRow(row).height = 20;
}

/** Add data-bar conditional formatting on the COUNT column (col 2 = B) */
function xlDataBar(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, col = 2) {
  const colLetter = String.fromCharCode(64 + col);
  ws.addConditionalFormatting({
    ref: `${colLetter}${fromRow}:${colLetter}${toRow}`,
    rules: [
      {
        type:     "dataBar",
        priority: 1,
        gradient: true,
        showValue: true,
        minLength: 0,
        maxLength: 100,
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
  });
}

/** Breakdown sheet: title + col-headers + data rows + data bars on count column */
function xlBreakdownSheet(
  wb:         ExcelJS.Workbook,
  sheetName:  string,
  stateName:  string,
  title:      string,
  colHeaders: string[],
  rows:       { label: string; count: number }[],
  generated:  string,
) {
  const ws   = wb.addWorksheet(sheetName);
  const cols = colHeaders.length;

  ws.getColumn(1).width = 32;
  for (let c = 2; c <= cols; c++) ws.getColumn(c).width = 14;

  xlTitle(ws, 1, cols, title,     XL.DARK, 14, 30);
  xlTitle(ws, 2, cols, stateName, XL.MID,  12, 24);
  xlTitle(ws, 3, cols, `Dijana: ${generated}`, XL.LIGHT.replace("FF", ""), 9, 18);
  // make generated row use dark text
  ws.getCell(3, 1).font = { size: 9, color: { argb: XL.SUBTEXT }, name: "Calibri" };

  ws.getRow(4).height = 8;

  xlColHeaders(ws, 5, colHeaders);

  const total   = rows.reduce((s, r) => s + r.count, 0);
  const dataStart = 6;

  rows.forEach((r, i) => {
    xlDataRow(ws, dataStart + i, [r.label, r.count, pct(r.count, total)], i % 2 !== 0, 1);
  });

  const dataEnd = dataStart + rows.length - 1;
  if (rows.length > 0) xlDataBar(ws, dataStart, dataEnd);

  xlTotalRow(ws, dataEnd + 1, ["JUMLAH", total, "100.0%"]);
}

// ── Gender visualization sheet ─────────────────────────────────────────────────

function xlGenderSheet(
  wb:        ExcelJS.Workbook,
  stateName: string,
  gender:    { label: string; count: number }[],
  generated: string,
) {
  const ws = wb.addWorksheet("Jantina");

  const male   = gender.find(g => g.label === "Male")   ?? gender[0];
  const female = gender.find(g => g.label === "Female") ?? gender[1];
  const maleCount   = male?.count   ?? 0;
  const femaleCount = female?.count ?? 0;
  const gTotal      = maleCount + femaleCount;
  const malePct     = pctNum(maleCount, gTotal);
  const femalePct   = 100 - malePct;

  // Column widths proportional to M/F split (min 8)
  ws.getColumn(1).width = Math.max(8,  Math.round(malePct   * 0.45));
  ws.getColumn(2).width = Math.max(8,  Math.round(femalePct * 0.45));

  xlTitle(ws, 1, 2, "PECAHAN JANTINA",  XL.DARK, 14, 30);
  xlTitle(ws, 2, 2, stateName,          XL.MID,  12, 24);
  xlTitle(ws, 3, 2, `Dijana: ${generated}`, XL.LIGHT.replace("FF",""), 9, 18);
  ws.getCell(3, 1).font = { size: 9, color: { argb: XL.SUBTEXT }, name: "Calibri" };
  ws.getRow(4).height = 8;

  // Gender split visual header row
  const hRow = 5;
  ws.getRow(hRow).height = 44;

  const mCell = ws.getCell(hRow, 1);
  mCell.value = "LELAKI";
  styleCell(mCell, {
    fill:  XL.MALE,
    font:  { bold: true, color: { argb: XL.HEADER }, size: 13, name: "Calibri" },
    align: { horizontal: "center", vertical: "middle" },
  });

  const fCell = ws.getCell(hRow, 2);
  fCell.value = "PEREMPUAN";
  styleCell(fCell, {
    fill:  XL.FEMALE,
    font:  { bold: true, color: { argb: XL.HEADER }, size: 13, name: "Calibri" },
    align: { horizontal: "center", vertical: "middle" },
  });

  // Count row
  ws.getRow(6).height = 28;
  [maleCount, femaleCount].forEach((v, i) => {
    const c = ws.getCell(6, i + 1);
    c.value = v;
    styleCell(c, {
      fill:  i === 0 ? "FFE0EBFF" : "FFFCE7F3",
      font:  { bold: true, size: 18, color: { argb: i === 0 ? XL.MALE : XL.FEMALE }, name: "Calibri" },
      align: { horizontal: "center", vertical: "middle" },
    });
  });

  // Pct row
  ws.getRow(7).height = 20;
  [malePct, femalePct].forEach((v, i) => {
    const c = ws.getCell(7, i + 1);
    c.value = `${v}%`;
    styleCell(c, {
      fill:  i === 0 ? "FFE0EBFF" : "FFFCE7F3",
      font:  { size: 11, color: { argb: XL.SUBTEXT }, name: "Calibri" },
      align: { horizontal: "center", vertical: "middle" },
    });
  });

  ws.getRow(8).height = 8;

  // Summary data table
  xlColHeaders(ws, 9, ["JANTINA", "BILANGAN", "PERATUSAN"]);
  ws.getColumn(3).width = 14;
  gender.forEach((g, i) => {
    xlDataRow(ws, 10 + i, [g.label, g.count, pct(g.count, gTotal)], i % 2 !== 0, 1);
  });
  xlTotalRow(ws, 10 + gender.length, ["JUMLAH", gTotal, "100.0%"]);
}

// ── Main Excel export ──────────────────────────────────────────────────────────

export async function exportStateExcel(data: StateExportData): Promise<void> {
  const { state, stats, charts } = data;
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const wb = new ExcelJS.Workbook();
  wb.creator   = "Techlympics";
  wb.created   = new Date();
  wb.modified  = new Date();

  // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
  const ws1  = wb.addWorksheet("Ringkasan");
  const COLS = 3;
  ws1.getColumn(1).width = 34;
  ws1.getColumn(2).width = 16;
  ws1.getColumn(3).width = 14;

  xlTitle(ws1, 1, COLS, "LAPORAN STATISTIK PENYERTAAN", XL.DARK, 14, 30);
  xlTitle(ws1, 2, COLS, state.name.toUpperCase(),        XL.MID,  12, 24);
  xlTitle(ws1, 3, COLS, `Dijana: ${generated}`,          XL.LIGHT.replace("FF",""), 9, 18);
  ws1.getCell(3,1).font = { size: 9, color: { argb: XL.SUBTEXT }, name: "Calibri" };
  ws1.getRow(4).height = 8;

  xlTitle(ws1, 5, COLS, "STATISTIK UTAMA", XL.DARK, 11, 22);
  xlColHeaders(ws1, 6, ["METRIK", "JUMLAH", ""]);

  const summary: [string, number][] = [
    ["Jumlah Penyertaan",              stats.totalParticipation],
    ["Jumlah Kontingen",               stats.totalContingents],
    ["Pengurus Berdaftar",             stats.totalManagers],
  ];
  summary.forEach(([label, val], i) => xlDataRow(ws1, 7 + i, [label, val, ""], i % 2 !== 0, 1));

  ws1.getRow(10).height = 8;
  xlTitle(ws1, 11, COLS, "KONTINGEN MENGIKUT JENIS", XL.DARK, 11, 22);
  xlColHeaders(ws1, 12, ["JENIS", "BILANGAN", ""]);

  const contingentRows: [string, number][] = [
    ["Sekolah Rendah",                 stats.primaryContingents],
    ["Sekolah Menengah",               stats.secondaryContingents],
    ["Institusi Pengajian Tinggi",     stats.higherContingents],
    ["Bebas",                          stats.independentContingents],
    ["Antarabangsa",                   stats.internationalContingents],
  ];
  contingentRows.forEach(([label, val], i) => xlDataRow(ws1, 13 + i, [label, val, ""], i % 2 !== 0, 1));

  // ── Sheet 2: Jantina (gender visual) ──────────────────────────────────────
  xlGenderSheet(wb, state.name, charts.byGender, generated);

  // ── Sheet 3: Bangsa ───────────────────────────────────────────────────────
  xlBreakdownSheet(wb, "Bangsa", state.name,
    "PENYERTAAN MENGIKUT BANGSA / ETNIK",
    ["BANGSA / ETNIK", "BILANGAN", "PERATUSAN"],
    charts.byEthnicity, generated);

  // ── Sheet 4: PPD / Daerah ─────────────────────────────────────────────────
  xlBreakdownSheet(wb, "PPD-Daerah", state.name,
    "PENYERTAAN MENGIKUT PPD / DAERAH",
    ["PPD / DAERAH", "BILANGAN", "PERATUSAN"],
    charts.byPpd, generated);

  // ── Sheet 5: Kategori Sekolah ─────────────────────────────────────────────
  if (charts.bySchoolCategory.length > 0) {
    xlBreakdownSheet(wb, "Kategori Sekolah", state.name,
      "PENYERTAAN MENGIKUT KATEGORI SEKOLAH",
      ["KATEGORI SEKOLAH", "BILANGAN", "PERATUSAN"],
      charts.bySchoolCategory, generated);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `Laporan-${slug(state.name)}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORD  (docx — corporate theme + visual bar charts)
// ═══════════════════════════════════════════════════════════════════════════════

const DC = {
  DARK:   "085782",
  MID:    "1D6EA5",
  MALE:   "1D4ED8",
  FEMALE: "DB2777",
  WHITE:  "FFFFFF",
  LIGHT:  "D1E9F5",
  GREY:   "E2E8F0",
  ALT:    "F8FAFC",
  TEXT:   "1F2937",
  SUB:    "6B7280",
};

const WD_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const ALL_BORDERS = { top: WD_BORDER, bottom: WD_BORDER, left: WD_BORDER, right: WD_BORDER };

function wdHCell(text: string, w?: number, fill = DC.DARK): TableCell {
  return new TableCell({
    width:   w ? { size: w, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.CLEAR, fill, color: "auto" },
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text, bold: true, color: DC.WHITE, size: 18, font: "Calibri" })],
    })],
  });
}

function wdDCell(
  text: string,
  fill = DC.WHITE,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
  w?: number,
): TableCell {
  return new TableCell({
    width:   w ? { size: w, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.CLEAR, fill, color: "auto" },
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children:  [new TextRun({ text, size: 18, bold, color: DC.TEXT, font: "Calibri" })],
    })],
  });
}

function wdSection(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 140 },
    children: [new TextRun({ text, color: DC.DARK, size: 24, bold: true, font: "Calibri" })],
  });
}

// Gender stacked split bar (blue | pink), full content width
function wdGenderBar(
  maleCount: number,
  femaleCount: number,
): Table {
  const total     = maleCount + femaleCount;
  const BAR       = 8200; // DXA total width
  const maleW     = total > 0 ? Math.max(200, Math.round(BAR * maleCount / total)) : BAR / 2;
  const femaleW   = BAR - maleW;
  const mPct      = pctNum(maleCount, total);
  const fPct      = 100 - mPct;

  const makeGenderCell = (
    fill: string,
    label: string,
    count: number,
    pctVal: number,
    w: number,
  ): TableCell =>
    new TableCell({
      width:         { size: w, type: WidthType.DXA },
      shading:       { type: ShadingType.CLEAR, fill, color: "auto" },
      verticalAlign: VerticalAlign.CENTER,
      borders:       ALL_BORDERS,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing:   { after: 40 },
          children:  [new TextRun({ text: label, bold: true, color: DC.WHITE, size: 22, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children:  [new TextRun({ text: `${n(count)}  (${pctVal}%)`, color: DC.WHITE, size: 20, font: "Calibri" })],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        height: { value: 900, rule: "exact" },
        children: [
          makeGenderCell(DC.MALE,   "LELAKI",     maleCount,   mPct, maleW),
          makeGenderCell(DC.FEMALE, "PEREMPUAN",  femaleCount, fPct, femaleW),
        ],
      }),
    ],
  });
}

// Horizontal bar chart table (label | filled | empty | count | %)
const BAR_MAX = 4000; // DXA max bar width
const COL_W   = { label: 2200, count: 900, pct: 700 };

function wdBarRow(
  label: string,
  count: number,
  total: number,
  maxCount: number,
  rowIdx: number,
): TableRow {
  const filled  = maxCount > 0 ? Math.max(20, Math.round(BAR_MAX * count / maxCount)) : 20;
  const empty   = BAR_MAX - filled;
  const bg      = rowIdx % 2 === 0 ? DC.WHITE : DC.ALT;
  const barFill = DC.DARK;

  return new TableRow({
    children: [
      wdDCell(label, bg, AlignmentType.LEFT,  false, COL_W.label),
      new TableCell({
        width:   { size: filled, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: barFill, color: "auto" },
        borders: ALL_BORDERS,
        children: [new Paragraph({ children: [] })],
      }),
      new TableCell({
        width:   { size: empty, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: bg, color: "auto" },
        borders: ALL_BORDERS,
        children: [new Paragraph({ children: [] })],
      }),
      wdDCell(n(count),          bg, AlignmentType.RIGHT, false, COL_W.count),
      wdDCell(pct(count, total), bg, AlignmentType.RIGHT, false, COL_W.pct),
    ],
  });
}

function wdBarChart(rows: { label: string; count: number }[]): Table {
  const total    = rows.reduce((s, r) => s + r.count, 0);
  const maxCount = rows[0]?.count ?? 1;
  const headerW  = COL_W.label + BAR_MAX + COL_W.count + COL_W.pct;

  return new Table({
    width: { size: headerW, type: WidthType.DXA },
    rows: [
      // Column header row
      new TableRow({
        children: [
          wdHCell("LABEL",       COL_W.label,  DC.MID),
          wdHCell("",            BAR_MAX,      DC.MID),
          wdHCell("BILANGAN",    COL_W.count,  DC.MID),
          wdHCell("PERATUSAN",   COL_W.pct,    DC.MID),
        ],
      }),
      ...rows.map((r, i) => wdBarRow(r.label, r.count, total, maxCount, i)),
      // Total row
      new TableRow({
        children: [
          wdDCell("JUMLAH", DC.LIGHT, AlignmentType.LEFT, true, COL_W.label),
          new TableCell({
            width:   { size: BAR_MAX, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: DC.LIGHT, color: "auto" },
            borders: ALL_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
          wdDCell(n(total),  DC.LIGHT, AlignmentType.RIGHT, true, COL_W.count),
          wdDCell("100.0%",  DC.LIGHT, AlignmentType.RIGHT, true, COL_W.pct),
        ],
      }),
    ],
  });
}

// Stats summary table
function wdSummaryTable(rows: [string, number][]): Table {
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [wdHCell("METRIK"), wdHCell("JUMLAH")] }),
      ...rows.map(([label, val], i) => new TableRow({
        children: [
          wdDCell(label,  i % 2 === 0 ? DC.WHITE : DC.ALT),
          wdDCell(n(val), i % 2 === 0 ? DC.WHITE : DC.ALT, AlignmentType.RIGHT),
        ],
      })),
    ],
  });
}

// ── Main Word export ───────────────────────────────────────────────────────────

export async function exportStateDocx(data: StateExportData): Promise<void> {
  const { state, stats, charts } = data;
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });

  const maleCount   = charts.byGender.find(g => g.label === "Male")?.count   ?? 0;
  const femaleCount = charts.byGender.find(g => g.label === "Female")?.count ?? 0;

  const summaryRows: [string, number][] = [
    ["Jumlah Penyertaan",              stats.totalParticipation],
    ["Jumlah Kontingen",               stats.totalContingents],
    ["Pengurus Berdaftar",             stats.totalManagers],
    ["Sekolah Rendah",                 stats.primaryContingents],
    ["Sekolah Menengah",               stats.secondaryContingents],
    ["Institusi Pengajian Tinggi",     stats.higherContingents],
    ["Bebas",                          stats.independentContingents],
    ["Antarabangsa",                   stats.internationalContingents],
  ];

  const bodyChildren = [
    // ── Cover header ────────────────────────────────────────────────────────
    new Paragraph({
      heading:   HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing:   { after: 80 },
      children:  [new TextRun({ text: "LAPORAN STATISTIK PENYERTAAN", bold: true, color: DC.DARK, size: 36, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { after: 60 },
      children:  [new TextRun({ text: state.name.toUpperCase(), bold: true, size: 28, color: DC.MID, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { after: 480 },
      children:  [new TextRun({ text: `Dijana pada: ${generated}`, size: 18, color: DC.SUB, font: "Calibri" })],
    }),

    // ── 1. Ringkasan ────────────────────────────────────────────────────────
    wdSection("1.  Ringkasan"),
    wdSummaryTable(summaryRows),

    // ── 2. Jantina (gender split donut-equivalent) ──────────────────────────
    wdSection("2.  Pecahan Jantina"),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: "Taburan peserta mengikut jantina.", size: 18, color: DC.SUB, font: "Calibri" })],
    }),
    wdGenderBar(maleCount, femaleCount),

    // ── 3. Bangsa / Etnik ────────────────────────────────────────────────────
    ...(charts.byEthnicity.length > 0 ? [
      wdSection("3.  Pecahan Bangsa / Etnik"),
      wdBarChart(charts.byEthnicity),
    ] : []),

    // ── 4. PPD / Daerah ──────────────────────────────────────────────────────
    ...(charts.byPpd.length > 0 ? [
      wdSection("4.  Pecahan PPD / Daerah"),
      wdBarChart(charts.byPpd),
    ] : []),

    // ── 5. Kategori Sekolah ──────────────────────────────────────────────────
    ...(charts.bySchoolCategory.length > 0 ? [
      wdSection("5.  Pecahan Kategori Sekolah"),
      wdBarChart(charts.bySchoolCategory),
    ] : []),

    // ── Footer ───────────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 720 },
      children:  [new TextRun({ text: "— Tamat Laporan —", size: 18, color: DC.SUB, italics: true, font: "Calibri" })],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: {
            top:    convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1),
            right:  convertInchesToTwip(1),
          },
        },
      },
      children: bodyChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Laporan-${slug(state.name)}.docx`);
}
