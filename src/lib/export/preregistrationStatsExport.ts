import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip,
} from "docx";

// ── Shared types ──────────────────────────────────────────────────────────────

export type StatsSummary = {
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};
export type GradeStat  = { eduLevel: string; classGrade: string; count: number };
export type StateStat  = {
  stateName:         string;
  schoolContingents: number;
  primarySchools:    number;
  secondarySchools:  number;
  teams:             number;
  participants:      number;
  male:              number;
  female:            number;
};
export type StatsPayload = { summary: StatsSummary; byGrade: GradeStat[]; byState: StateStat[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function n(v: number) { return v.toLocaleString("ms-MY"); }

// ── XLSX export ───────────────────────────────────────────────────────────────

export function exportXlsx(eventName: string, slug: string, s: StatsPayload) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summaryAoa = [
    ["STATISTIK PRA-PENDAFTARAN"],
    [eventName],
    [],
    ["METRIK", "JUMLAH"],
    ["Kontingen Sekolah",  s.summary.schoolContingents],
    ["Sekolah Rendah",     s.summary.primarySchools],
    ["Sekolah Menengah",   s.summary.secondarySchools],
    ["Jumlah Pasukan",     s.summary.teams],
    ["Jumlah Peserta",     s.summary.participants],
    [],
    ["JANTINA", "BILANGAN", "%"],
    ["Lelaki",    s.summary.male,   s.summary.participants ? +(s.summary.male   / s.summary.participants * 100).toFixed(1) : 0],
    ["Perempuan", s.summary.female, s.summary.participants ? +(s.summary.female / s.summary.participants * 100).toFixed(1) : 0],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws1["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 10 }];
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

  // ── Sheet 2: By Grade ─────────────────────────────────────────────────────
  const primary   = s.byGrade.filter((g) => g.eduLevel === "PRIMARY");
  const secondary = s.byGrade.filter((g) => g.eduLevel === "SECONDARY");
  const youth     = s.byGrade.filter((g) => g.eduLevel === "YOUTH");
  const gradeAoa: (string | number)[][] = [
    ["TAHAP PENDIDIKAN", "GRED", "BILANGAN PESERTA"],
  ];
  if (primary.length)   { gradeAoa.push(["Sekolah Rendah", "", ""]); primary.forEach((g)   => gradeAoa.push(["", g.classGrade, g.count])); }
  if (secondary.length) { gradeAoa.push(["Sekolah Menengah", "", ""]); secondary.forEach((g) => gradeAoa.push(["", g.classGrade, g.count])); }
  if (youth.length)     { gradeAoa.push(["Belia / Lain", "", ""]); youth.forEach((g)     => gradeAoa.push(["", g.classGrade, g.count])); }
  const ws2 = XLSX.utils.aoa_to_sheet(gradeAoa);
  ws2["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Mengikut Gred");

  // ── Sheet 3: By State ─────────────────────────────────────────────────────
  const totals = s.byState.reduce((acc, r) => ({
    schoolContingents: acc.schoolContingents + r.schoolContingents,
    primarySchools:    acc.primarySchools    + r.primarySchools,
    secondarySchools:  acc.secondarySchools  + r.secondarySchools,
    teams:             acc.teams             + r.teams,
    participants:      acc.participants      + r.participants,
    male:              acc.male              + r.male,
    female:            acc.female            + r.female,
  }), { schoolContingents: 0, primarySchools: 0, secondarySchools: 0, teams: 0, participants: 0, male: 0, female: 0 });

  const stateAoa: (string | number)[][] = [
    ["NEGERI", "KONTINGEN SEKOLAH", "SEKOLAH RENDAH", "SEKOLAH MENENGAH", "PASUKAN", "PESERTA", "LELAKI", "PEREMPUAN"],
    ...s.byState.map((r) => [r.stateName, r.schoolContingents, r.primarySchools, r.secondarySchools, r.teams, r.participants, r.male, r.female]),
    ["JUMLAH", totals.schoolContingents, totals.primarySchools, totals.secondarySchools, totals.teams, totals.participants, totals.male, totals.female],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(stateAoa);
  ws3["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 17 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Mengikut Negeri");

  const out  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Statistik-PraPendaftaran-${slug}.xlsx`,
  );
}

// ── DOCX helpers ──────────────────────────────────────────────────────────────

const BLUE   = "1D4ED8"; // Tailwind blue-700
const LBLUE  = "DBEAFE"; // Tailwind blue-100
const GREY   = "F4F4F5"; // Tailwind zinc-100
const WHITE  = "FFFFFF";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function hCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: WHITE, size: 20 })],
    })],
    shading: { type: ShadingType.CLEAR, fill: BLUE, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
  });
}

function dCell(text: string, shade = WHITE, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, size: 20, bold, color: shade === WHITE ? "374151" : "1E3A8A" })],
    })],
    shading: { type: ShadingType.CLEAR, fill: shade, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({ heading: level, spacing: { before: 320, after: 120 }, children: [new TextRun({ text, color: "1E3A8A" })] });
}

// ── DOCX export ───────────────────────────────────────────────────────────────

export async function exportDocx(eventName: string, slug: string, s: StatsPayload): Promise<void> {
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const totalParticipants = s.summary.participants || 1;
  const malePct  = (s.summary.male   / totalParticipants * 100).toFixed(1);
  const femPct   = (s.summary.female / totalParticipants * 100).toFixed(1);

  // ── Summary table ──────────────────────────────────────────────────────────
  const summaryRows: [string, number][] = [
    ["Kontingen Sekolah",  s.summary.schoolContingents],
    ["Sekolah Rendah",     s.summary.primarySchools],
    ["Sekolah Menengah",   s.summary.secondarySchools],
    ["Jumlah Pasukan",     s.summary.teams],
    ["Jumlah Peserta",     s.summary.participants],
  ];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
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

  // ── Gender table ──────────────────────────────────────────────────────────
  const genderTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("JANTINA"), hCell("BILANGAN"), hCell("PERATUSAN")] }),
      new TableRow({ children: [dCell("Lelaki", WHITE), dCell(n(s.summary.male), WHITE, AlignmentType.RIGHT), dCell(`${malePct}%`, WHITE, AlignmentType.RIGHT)] }),
      new TableRow({ children: [dCell("Perempuan", GREY), dCell(n(s.summary.female), GREY, AlignmentType.RIGHT), dCell(`${femPct}%`, GREY, AlignmentType.RIGHT)] }),
    ],
  });

  // ── Grade table ───────────────────────────────────────────────────────────
  type GradeGroup = { heading: string; color: typeof GREY; items: GradeStat[] };
  const gradeGroups: GradeGroup[] = [
    { heading: "Sekolah Rendah (Darjah)", color: GREY, items: s.byGrade.filter((g) => g.eduLevel === "PRIMARY") },
    { heading: "Sekolah Menengah (Tingkatan)", color: GREY, items: s.byGrade.filter((g) => g.eduLevel === "SECONDARY") },
    { heading: "Belia / Lain", color: GREY, items: s.byGrade.filter((g) => g.eduLevel === "YOUTH") },
  ].filter((g) => g.items.length > 0);

  const gradeRows: TableRow[] = [
    new TableRow({ children: [hCell("TAHAP PENDIDIKAN"), hCell("GRED"), hCell("BILANGAN")] }),
  ];
  gradeGroups.forEach((group) => {
    gradeRows.push(new TableRow({
      children: [
        new TableCell({
          columnSpan: 3,
          children: [new Paragraph({ children: [new TextRun({ text: group.heading, bold: true, color: "1E3A8A", size: 20 })] })],
          shading: { type: ShadingType.CLEAR, fill: LBLUE, color: "auto" },
          borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
        }),
      ],
    }));
    group.items.forEach((item, i) => {
      gradeRows.push(new TableRow({
        children: [
          dCell("", i % 2 === 0 ? WHITE : GREY),
          dCell(item.classGrade, i % 2 === 0 ? WHITE : GREY),
          dCell(n(item.count), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      }));
    });
  });
  const gradeTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: gradeRows });

  // ── State table ───────────────────────────────────────────────────────────
  const COL_W = convertInchesToTwip(0.85);
  const stateHdrs = ["NEGERI", "KONTINGEN", "RENDAH", "MENENGAH", "PASUKAN", "PESERTA", "LELAKI", "PEREMPUAN"];
  const totals = s.byState.reduce((acc, r) => ({
    schoolContingents: acc.schoolContingents + r.schoolContingents,
    primarySchools:    acc.primarySchools    + r.primarySchools,
    secondarySchools:  acc.secondarySchools  + r.secondarySchools,
    teams:             acc.teams             + r.teams,
    participants:      acc.participants      + r.participants,
    male:              acc.male              + r.male,
    female:            acc.female            + r.female,
  }), { schoolContingents: 0, primarySchools: 0, secondarySchools: 0, teams: 0, participants: 0, male: 0, female: 0 });

  const stateTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: stateHdrs.map((h) => hCell(h, COL_W)) }),
      ...s.byState.map((r, i) => new TableRow({
        children: [
          dCell(r.stateName,           i % 2 === 0 ? WHITE : GREY),
          dCell(n(r.schoolContingents), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.primarySchools),    i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.secondarySchools),  i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.teams),             i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.participants),      i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.male),              i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.female),            i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
      new TableRow({
        children: [
          dCell("JUMLAH", LBLUE, AlignmentType.LEFT, true),
          dCell(n(totals.schoolContingents), LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.primarySchools),    LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.secondarySchools),  LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.teams),             LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.participants),      LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.male),              LBLUE, AlignmentType.RIGHT, true),
          dCell(n(totals.female),            LBLUE, AlignmentType.RIGHT, true),
        ],
      }),
    ],
  });

  // ── Assemble document ─────────────────────────────────────────────────────
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
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "LAPORAN STATISTIK PRA-PENDAFTARAN", bold: true, color: "1D4ED8", size: 32 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: eventName.toUpperCase(), bold: true, size: 26, color: "374151" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: `Dijana pada: ${generated}`, size: 18, color: "9CA3AF" })],
        }),

        heading("1. Ringkasan Penyertaan"),
        summaryTable,

        heading("2. Pecahan Jantina"),
        genderTable,

        heading("3. Peserta Mengikut Gred"),
        gradeTable,

        heading("4. Pecahan Mengikut Negeri"),
        stateTable,

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: "9CA3AF", italics: true })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Statistik-PraPendaftaran-${slug}.docx`);
}
