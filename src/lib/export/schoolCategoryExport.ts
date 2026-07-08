import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip,
} from "docx";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SchoolCategoryData = {
  categoryKey:   string;
  categoryLabel: string;
  stats: {
    schools:      number;
    participants: number;
    male:         number;
    female:       number;
    managers:     number;
    trainers:     number;
    teams:        number;
  };
  byGender: { label: string; count: number }[];
  byGrade:  { label: string; count: number }[];
  schools: {
    state:        string;
    name:         string;
    participants: number;
    male:         number;
    female:       number;
    teams:        number;
    managers:     number;
    trainers:     number;
  }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function n(v: number) { return v.toLocaleString("ms-MY"); }

const BLUE    = "1D4ED8";
const LBLUE   = "DBEAFE";
const GREY    = "F4F4F5";
const WHITE   = "FFFFFF";
const BORDER  = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };

function hCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text, bold: true, color: WHITE, size: 20 })],
    })],
    shading: { type: ShadingType.CLEAR, fill: BLUE, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
  });
}

function dCell(
  text: string,
  shade = WHITE,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
): TableCell {
  return new TableCell({
    children: [new Paragraph({
      alignment: align,
      children:  [new TextRun({ text, size: 20, bold, color: shade === WHITE ? "374151" : "1E3A8A" })],
    })],
    shading: { type: ShadingType.CLEAR, fill: shade, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, color: "1E3A8A" })],
  });
}

// ── DOCX export ───────────────────────────────────────────────────────────────

export async function exportSchoolCategoryDocx(data: SchoolCategoryData): Promise<void> {
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const { stats, byGender, byGrade, schools } = data;
  const totalPart = stats.participants || 1;

  // ── 1. Summary table ───────────────────────────────────────────────────────
  const summaryRows: [string, number][] = [
    ["Bilangan Sekolah",    stats.schools],
    ["Jumlah Peserta",      stats.participants],
    ["Peserta Lelaki",      stats.male],
    ["Peserta Perempuan",   stats.female],
    ["Bilangan Pasukan",    stats.teams],
    ["Bilangan Pengurus",   stats.managers],
    ["Bilangan Jurulatih",  stats.trainers],
  ];

  const summaryTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("METRIK"), hCell("JUMLAH")] }),
      ...summaryRows.map((row, i) => new TableRow({
        children: [
          dCell(row[0], i % 2 === 0 ? WHITE : GREY),
          dCell(n(row[1]), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
    ],
  });

  // ── 2. Gender table ────────────────────────────────────────────────────────
  const genderTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("JANTINA"), hCell("BILANGAN"), hCell("PERATUSAN")] }),
      ...byGender.map((g, i) => new TableRow({
        children: [
          dCell(g.label, i % 2 === 0 ? WHITE : GREY),
          dCell(n(g.count), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(`${(g.count / totalPart * 100).toFixed(1)}%`, i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
    ],
  });

  // ── 3. Grade table ─────────────────────────────────────────────────────────
  const gradeTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("GRED"), hCell("BILANGAN PESERTA"), hCell("PERATUSAN")] }),
      ...byGrade.map((g, i) => new TableRow({
        children: [
          dCell(g.label, i % 2 === 0 ? WHITE : GREY),
          dCell(n(g.count), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(`${(g.count / totalPart * 100).toFixed(1)}%`, i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
    ],
  });

  // ── 4. School list table ───────────────────────────────────────────────────
  const COL = convertInchesToTwip(0.9);
  const schoolHdrs = ["NEGERI", "NAMA SEKOLAH", "PESERTA", "LELAKI", "PEREMPUAN", "PASUKAN", "PENGURUS"];

  const schoolTotals = schools.reduce((acc, s) => ({
    participants: acc.participants + s.participants,
    male:         acc.male         + s.male,
    female:       acc.female       + s.female,
    teams:        acc.teams        + s.teams,
    managers:     acc.managers     + s.managers,
  }), { participants: 0, male: 0, female: 0, teams: 0, managers: 0 });

  const schoolTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: schoolHdrs.map((h) => hCell(h, COL)) }),
      ...schools.map((s, i) => new TableRow({
        children: [
          dCell(s.state,         i % 2 === 0 ? WHITE : GREY),
          dCell(s.name,          i % 2 === 0 ? WHITE : GREY),
          dCell(n(s.participants), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(s.male),       i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(s.female),     i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(s.teams),      i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(s.managers),   i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
      new TableRow({
        children: [
          dCell("JUMLAH", LBLUE, AlignmentType.LEFT, true),
          dCell("",       LBLUE),
          dCell(n(schoolTotals.participants), LBLUE, AlignmentType.RIGHT, true),
          dCell(n(schoolTotals.male),         LBLUE, AlignmentType.RIGHT, true),
          dCell(n(schoolTotals.female),       LBLUE, AlignmentType.RIGHT, true),
          dCell(n(schoolTotals.teams),        LBLUE, AlignmentType.RIGHT, true),
          dCell(n(schoolTotals.managers),     LBLUE, AlignmentType.RIGHT, true),
        ],
      }),
    ],
  });

  // ── Assemble document ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: {
            top: convertInchesToTwip(1), bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25),
          },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "LAPORAN KATEGORI SEKOLAH", bold: true, color: "1D4ED8", size: 32 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: data.categoryLabel.toUpperCase(), bold: true, size: 26, color: "374151" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: `Dijana pada: ${generated}`, size: 18, color: "9CA3AF" })],
        }),

        heading("1. Ringkasan"),
        summaryTable,

        heading("2. Pecahan Jantina"),
        genderTable,

        heading("3. Pecahan Mengikut Gred"),
        gradeTable,

        heading("4. Senarai Sekolah"),
        schoolTable,

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: "9CA3AF", italics: true })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const slug = data.categoryKey.toLowerCase().replace(/_/g, "-");
  triggerDownload(blob, `Laporan-Kategori-${slug}.docx`);
}
