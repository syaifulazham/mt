import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip,
} from "docx";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StateExportData = {
  state: { name: string; code?: string | null };
  stats: {
    totalParticipation:      number;
    totalContingents:        number;
    totalManagers:           number;
    primaryContingents:      number;
    secondaryContingents:    number;
    higherContingents:       number;
    independentContingents:  number;
    internationalContingents: number;
  };
  charts: {
    byGender:    { label: string; count: number }[];
    byEthnicity: { label: string; count: number }[];
    byPpd:       { label: string; count: number }[];
  };
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function n(v: number) { return v.toLocaleString("ms-MY"); }
function pct(v: number, total: number) {
  return total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0.0%";
}

// ── Excel export ──────────────────────────────────────────────────────────────

export function exportStateExcel(data: StateExportData): void {
  const { state, stats, charts } = data;
  const wb   = XLSX.utils.book_new();
  const name = state.name;

  // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
  const summaryAoa: (string | number)[][] = [
    [`LAPORAN STATISTIK PENYERTAAN — ${name.toUpperCase()}`],
    [],
    ["METRIK", "JUMLAH"],
    ["Jumlah Penyertaan",              stats.totalParticipation],
    ["Jumlah Kontingen",               stats.totalContingents],
    ["Pengurus Berdaftar",             stats.totalManagers],
    [],
    ["KONTINGEN MENGIKUT JENIS", "BILANGAN"],
    ["Sekolah Rendah",                 stats.primaryContingents],
    ["Sekolah Menengah",               stats.secondaryContingents],
    ["Institusi Pengajian Tinggi",     stats.higherContingents],
    ["Bebas",                          stats.independentContingents],
    ["Antarabangsa",                   stats.internationalContingents],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws1["!cols"] = [{ wch: 36 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

  // ── Sheet 2: Jantina ──────────────────────────────────────────────────────
  const gTotal = charts.byGender.reduce((s, r) => s + r.count, 0);
  const genderAoa: (string | number)[][] = [
    [`PENYERTAAN MENGIKUT JANTINA — ${name}`],
    [],
    ["JANTINA", "BILANGAN", "PERATUSAN"],
    ...charts.byGender.map(r => [r.label, r.count, pct(r.count, gTotal)]),
    [],
    ["JUMLAH", gTotal, "100.0%"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(genderAoa);
  ws2["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Jantina");

  // ── Sheet 3: Bangsa / Etnik ───────────────────────────────────────────────
  const eTotal = charts.byEthnicity.reduce((s, r) => s + r.count, 0);
  const ethAoa: (string | number)[][] = [
    [`PENYERTAAN MENGIKUT BANGSA — ${name}`],
    [],
    ["BANGSA / ETNIK", "BILANGAN", "PERATUSAN"],
    ...charts.byEthnicity.map(r => [r.label, r.count, pct(r.count, eTotal)]),
    [],
    ["JUMLAH", eTotal, "100.0%"],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(ethAoa);
  ws3["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Bangsa");

  // ── Sheet 4: PPD / Daerah ─────────────────────────────────────────────────
  const pTotal = charts.byPpd.reduce((s, r) => s + r.count, 0);
  const ppdAoa: (string | number)[][] = [
    [`PENYERTAAN MENGIKUT PPD / DAERAH — ${name}`],
    [],
    ["PPD / DAERAH", "BILANGAN", "PERATUSAN"],
    ...charts.byPpd.map(r => [r.label, r.count, pct(r.count, pTotal)]),
    [],
    ["JUMLAH", pTotal, "100.0%"],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(ppdAoa);
  ws4["!cols"] = [{ wch: 36 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, "PPD-Daerah");

  const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `Laporan-${name.replace(/\s+/g, "-")}.xlsx`);
}

// ── Word / DOCX helpers ───────────────────────────────────────────────────────

const BLUE   = "1D4ED8";
const LBLUE  = "DBEAFE";
const GREY   = "F4F4F5";
const WHITE  = "FFFFFF";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };

function hCell(text: string, w?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: WHITE, size: 20 })] })],
    shading:  { type: ShadingType.CLEAR, fill: BLUE, color: "auto" },
    borders:  { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...(w ? { width: { size: w, type: WidthType.DXA } } : {}),
  });
}

function dCell(
  text: string,
  shade = WHITE,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 20, bold, color: shade === WHITE ? "374151" : "1E3A8A" })] })],
    shading:  { type: ShadingType.CLEAR, fill: shade, color: "auto" },
    borders:  { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, color: "1E3A8A" })],
  });
}

function statsTable(rows: [string, number][]): Table {
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("METRIK"), hCell("JUMLAH")] }),
      ...rows.map(([label, val], i) => new TableRow({
        children: [
          dCell(label, i % 2 === 0 ? WHITE : GREY),
          dCell(n(val), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
    ],
  });
}

function breakdownTable(
  rows: { label: string; count: number }[],
  total: number,
  colLabel: string,
): Table {
  return new Table({
    width: { size: 75, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell(colLabel), hCell("BILANGAN"), hCell("PERATUSAN")] }),
      ...rows.map((r, i) => new TableRow({
        children: [
          dCell(r.label, i % 2 === 0 ? WHITE : GREY),
          dCell(n(r.count), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(pct(r.count, total), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
      new TableRow({ children: [
        dCell("JUMLAH", LBLUE, AlignmentType.LEFT, true),
        dCell(n(total), LBLUE, AlignmentType.RIGHT, true),
        dCell("100.0%", LBLUE, AlignmentType.RIGHT, true),
      ]}),
    ],
  });
}

// ── Word / DOCX export ────────────────────────────────────────────────────────

export async function exportStateDocx(data: StateExportData): Promise<void> {
  const { state, stats, charts } = data;
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });

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

  const gTotal = charts.byGender.reduce((s, r) => s + r.count, 0);
  const eTotal = charts.byEthnicity.reduce((s, r) => s + r.count, 0);
  const pTotal = charts.byPpd.reduce((s, r) => s + r.count, 0);

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: {
            top:    convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1.25),
            right:  convertInchesToTwip(1.25),
          },
        },
      },
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "LAPORAN STATISTIK PENYERTAAN", bold: true, color: BLUE, size: 32 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: state.name.toUpperCase(), bold: true, size: 28, color: "374151" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: `Dijana pada: ${generated}`, size: 18, color: "9CA3AF" })],
        }),

        // 1. Ringkasan
        heading("1. Ringkasan"),
        statsTable(summaryRows),

        // 2. Jantina
        heading("2. Pecahan Mengikut Jantina"),
        breakdownTable(charts.byGender, gTotal, "JANTINA"),

        // 3. Bangsa
        heading("3. Pecahan Mengikut Bangsa / Etnik"),
        breakdownTable(charts.byEthnicity, eTotal, "BANGSA / ETNIK"),

        // 4. PPD
        ...(charts.byPpd.length > 0 ? [
          heading("4. Pecahan Mengikut PPD / Daerah"),
          breakdownTable(charts.byPpd, pTotal, "PPD / DAERAH"),
        ] : []),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: "9CA3AF", italics: true })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Laporan-${state.name.replace(/\s+/g, "-")}.docx`);
}
