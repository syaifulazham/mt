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
// EXCEL  (exceljs — single sheet, two-column layout, corporate theme + data bars)
// ═══════════════════════════════════════════════════════════════════════════════

const XL = {
  DARK:    "FF085782",
  MID:     "FF1D6EA5",
  ACCENT:  "FF0EA5E9",
  MALE:    "FF1D4ED8",
  FEMALE:  "FFDB2777",
  HEADER:  "FFFFFFFF",
  LIGHT:   "FFD1E9F5",
  ALT:     "FFF8FAFC",
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

// ── Column-offset aware helpers ────────────────────────────────────────────────

function xlTitleAt(
  ws: ExcelJS.Worksheet,
  row: number, startCol: number, endCol: number,
  text: string, fill: string, size = 11, height = 22,
): void {
  ws.mergeCells(row, startCol, row, endCol);
  const cell = ws.getCell(row, startCol);
  cell.value = text;
  styleCell(cell, {
    fill,
    font:  { bold: true, color: { argb: XL.HEADER }, size, name: "Calibri" },
    align: { horizontal: "center", vertical: "middle" },
  });
  const r = ws.getRow(row);
  if (!r.height || r.height < height) r.height = height;
}

function xlColHeadersAt(
  ws: ExcelJS.Worksheet, row: number, startCol: number, headers: string[],
) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, startCol + i);
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

function xlDataRowAt(
  ws: ExcelJS.Worksheet, row: number, startCol: number,
  values: (string | number)[], isAlt: boolean, rightAlignFrom = 1,
) {
  const fill = isAlt ? XL.ALT : XL.WHITE;
  values.forEach((v, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = v;
    cell.fill  = solidFill(fill);
    cell.font  = { size: 10, color: { argb: XL.TEXT }, name: "Calibri" };
    cell.alignment = { horizontal: i >= rightAlignFrom ? "right" : "left", vertical: "middle" };
    cell.border    = borderAll();
  });
  ws.getRow(row).height = 18;
}

function xlTotalRowAt(
  ws: ExcelJS.Worksheet, row: number, startCol: number, values: (string | number)[],
) {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, startCol + i);
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

/** Colored row for gender (bold label, tinted background, colored text) */
function xlColoredRow(
  ws: ExcelJS.Worksheet, row: number, startCol: number,
  label: string, count: number, pctStr: string,
  bg: string, textArgb: string,
) {
  ws.getRow(row).height = 22;
  (
    [[label, "left", true], [count, "right", true], [pctStr, "right", false]] as
    [string | number, "left" | "right", boolean][]
  ).forEach(([val, align, bold], i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = val;
    styleCell(cell, {
      fill:   bg,
      font:   { bold, size: 10, color: { argb: textArgb }, name: "Calibri" },
      align:  { horizontal: align, vertical: "middle" },
      border: true,
    });
  });
}

/** Data-bar conditional formatting on the given column (1-based) */
function xlDataBar(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, col = 2) {
  const colLetter = String.fromCharCode(64 + col);
  ws.addConditionalFormatting({
    ref: `${colLetter}${fromRow}:${colLetter}${toRow}`,
    rules: [
      // ExcelJS's xlsx WRITER reads cfvo/color at the rule top-level (flat),
      // not nested under dataBar. Nesting causes "forEach of undefined" crash.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        type:      "dataBar",
        priority:  1,
        cfvo:      [{ type: "min" }, { type: "max" }],
        color:     { argb: "FF085782" },
        gradient:  true,
        showValue: true,
        minLength: 0,
        maxLength: 100,
      } as any,
    ],
  });
}

/**
 * Render a breakdown table (title + col-headers + data rows + total + data bar).
 * Returns the next available row after the table.
 */
function xlBreakdown(
  ws:       ExcelJS.Worksheet,
  row:      number,
  startCol: number,
  title:    string,
  colHdrs:  string[],
  rows:     { label: string; count: number }[],
): number {
  const endCol   = startCol + colHdrs.length - 1;
  const countCol = startCol + 1;
  const total    = rows.reduce((s, r) => s + r.count, 0);

  xlTitleAt(ws, row++, startCol, endCol, title, XL.DARK, 11, 22);
  xlColHeadersAt(ws, row++, startCol, colHdrs);
  const dataStart = row;
  rows.forEach((r, i) => {
    xlDataRowAt(ws, row++, startCol, [r.label, r.count, pct(r.count, total)], i % 2 !== 0, 1);
  });
  if (rows.length > 0) xlDataBar(ws, dataStart, row - 1, countCol);
  xlTotalRowAt(ws, row++, startCol, ["JUMLAH", total, "100.0%"]);
  return row;
}

// ── Main Excel export — single sheet, two-column layout ────────────────────────

export async function exportStateExcel(data: StateExportData): Promise<void> {
  const { state, stats, charts } = data;
  const generated = new Date().toLocaleDateString("ms-MY", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const wb = new ExcelJS.Workbook();
  wb.creator  = "Techlympics";
  wb.created  = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Laporan");

  // Layout: 7 columns — A:C (left table), D (spacer), E:G (right table)
  const LC = 1; // left start col
  const RC = 5; // right start col
  const TC = 7; // total cols

  ws.getColumn(1).width = 36; // A – left label
  ws.getColumn(2).width = 14; // B – left count
  ws.getColumn(3).width = 12; // C – left pct
  ws.getColumn(4).width = 3;  // D – spacer
  ws.getColumn(5).width = 36; // E – right label
  ws.getColumn(6).width = 14; // F – right count
  ws.getColumn(7).width = 12; // G – right pct

  // ── Full-width header (rows 1–3) ───────────────────────────────────────────
  xlTitleAt(ws, 1, LC, TC, "LAPORAN STATISTIK PENYERTAAN", XL.DARK, 14, 32);
  xlTitleAt(ws, 2, LC, TC, state.name.toUpperCase(),        XL.MID,  12, 26);
  xlTitleAt(ws, 3, LC, TC, `Dijana: ${generated}`,          XL.LIGHT, 9, 18);
  ws.getCell(3, LC).font = { size: 9, color: { argb: XL.SUBTEXT }, name: "Calibri" };
  ws.getRow(4).height = 10; // gap

  let leftRow  = 5;
  let rightRow = 5;

  // ── Block 1 LEFT: Statistik Utama (summary counts) ────────────────────────
  {
    const rows: [string, number][] = [
      ["Jumlah Penyertaan",   stats.totalParticipation],
      ["Jumlah Kontingen",    stats.totalContingents],
      ["Pengurus Berdaftar",  stats.totalManagers],
    ];
    xlTitleAt(ws, leftRow++, LC, LC + 2, "STATISTIK UTAMA", XL.DARK, 11, 22);
    xlColHeadersAt(ws, leftRow++, LC, ["METRIK", "JUMLAH", ""]);
    rows.forEach(([label, val], i) => {
      xlDataRowAt(ws, leftRow++, LC, [label, val, ""], i % 2 !== 0, 1);
    });
    xlTotalRowAt(ws, leftRow++, LC, ["PENYERTAAN", stats.totalParticipation, ""]);
    leftRow++; // gap
  }

  // ── Block 1 RIGHT: Bangsa / Etnik ─────────────────────────────────────────
  rightRow = xlBreakdown(ws, rightRow, RC,
    "PENYERTAAN MENGIKUT BANGSA / ETNIK",
    ["BANGSA / ETNIK", "BILANGAN", "PERATUSAN"],
    charts.byEthnicity,
  );
  rightRow++; // gap

  // Sync both columns before block 2
  leftRow = rightRow = Math.max(leftRow, rightRow);

  // ── Block 2 LEFT: Kontingen Mengikut Jenis ────────────────────────────────
  {
    const rows: [string, number][] = [
      ["Sekolah Rendah",               stats.primaryContingents],
      ["Sekolah Menengah",             stats.secondaryContingents],
      ["Institusi Pengajian Tinggi",   stats.higherContingents],
      ["Bebas",                        stats.independentContingents],
      ["Antarabangsa",                 stats.internationalContingents],
    ];
    const total = rows.reduce((s, [, v]) => s + v, 0);
    xlTitleAt(ws, leftRow++, LC, LC + 2, "KONTINGEN MENGIKUT JENIS", XL.DARK, 11, 22);
    xlColHeadersAt(ws, leftRow++, LC, ["JENIS KONTINGEN", "BILANGAN", "PERATUSAN"]);
    const dataStart = leftRow;
    rows.forEach(([label, val], i) => {
      xlDataRowAt(ws, leftRow++, LC, [label, val, pct(val, total)], i % 2 !== 0, 1);
    });
    if (rows.length > 0) xlDataBar(ws, dataStart, leftRow - 1, LC + 1);
    xlTotalRowAt(ws, leftRow++, LC, ["JUMLAH", total, "100.0%"]);
    leftRow++; // gap
  }

  // ── Block 2 RIGHT: Pecahan Jantina ────────────────────────────────────────
  {
    const male   = charts.byGender.find(g => g.label === "Male")   ?? { count: 0 };
    const female = charts.byGender.find(g => g.label === "Female") ?? { count: 0 };
    const total  = male.count + female.count;

    xlTitleAt(ws, rightRow++, RC, RC + 2, "PECAHAN JANTINA", XL.DARK, 11, 22);
    xlColHeadersAt(ws, rightRow++, RC, ["JANTINA", "BILANGAN", "PERATUSAN"]);
    xlColoredRow(ws, rightRow++, RC, "LELAKI",     male.count,   pct(male.count,   total), "FFE0EBFF", XL.MALE);
    xlColoredRow(ws, rightRow++, RC, "PEREMPUAN",  female.count, pct(female.count, total), "FFFCE7F3", XL.FEMALE);
    xlTotalRowAt(ws, rightRow++, RC, ["JUMLAH", total, "100.0%"]);
    rightRow++; // gap
  }

  // Sync both columns before block 3
  leftRow = rightRow = Math.max(leftRow, rightRow);

  // ── Block 3 LEFT: Kategori Sekolah ────────────────────────────────────────
  if (charts.bySchoolCategory.length > 0) {
    leftRow = xlBreakdown(ws, leftRow, LC,
      "PENYERTAAN MENGIKUT KATEGORI SEKOLAH",
      ["KATEGORI SEKOLAH", "BILANGAN", "PERATUSAN"],
      charts.bySchoolCategory,
    );
  }

  // ── Block 3 RIGHT: PPD / Daerah ───────────────────────────────────────────
  if (charts.byPpd.length > 0) {
    rightRow = xlBreakdown(ws, rightRow, RC,
      "PENYERTAAN MENGIKUT PPD / DAERAH",
      ["PPD / DAERAH", "BILANGAN", "PERATUSAN"],
      charts.byPpd,
    );
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

// Clean 3-column breakdown table (no proportional bar cells — consistent column count)
function wdBarChart(
  rows: { label: string; count: number }[],
  labelHeader = "KETERANGAN",
): Table {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          wdHCell(labelHeader),
          wdHCell("BILANGAN"),
          wdHCell("PERATUSAN"),
        ],
      }),
      ...rows.map((r, i) => {
        const bg = i % 2 === 0 ? DC.WHITE : DC.ALT;
        return new TableRow({
          children: [
            wdDCell(r.label,           bg, AlignmentType.LEFT),
            wdDCell(n(r.count),        bg, AlignmentType.RIGHT),
            wdDCell(pct(r.count,total),bg, AlignmentType.RIGHT),
          ],
        });
      }),
      new TableRow({
        children: [
          wdDCell("JUMLAH",  DC.LIGHT, AlignmentType.LEFT,  true),
          wdDCell(n(total),  DC.LIGHT, AlignmentType.RIGHT, true),
          wdDCell("100.0%",  DC.LIGHT, AlignmentType.RIGHT, true),
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
      wdBarChart(charts.byEthnicity, "BANGSA / ETNIK"),
    ] : []),

    // ── 4. PPD / Daerah ──────────────────────────────────────────────────────
    ...(charts.byPpd.length > 0 ? [
      wdSection("4.  Pecahan PPD / Daerah"),
      wdBarChart(charts.byPpd, "PPD"),
    ] : []),

    // ── 5. Kategori Sekolah ──────────────────────────────────────────────────
    ...(charts.bySchoolCategory.length > 0 ? [
      wdSection("5.  Pecahan Kategori Sekolah"),
      wdBarChart(charts.bySchoolCategory, "KATEGORI"),
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
