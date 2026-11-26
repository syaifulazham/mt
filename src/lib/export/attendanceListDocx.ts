import {
  AlignmentType, BorderStyle, Document, Packer, PageOrientation, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip,
} from "docx";
import {
  attendanceListNote, LIST_MODE_LABEL, type AttendanceListData, type CompetitionGroup, type Tally,
} from "@/lib/reports/attendanceListData";

// Senarai Kehadiran Penyertaan as Word: A4 landscape, the summary by
// competition, then one table per competition (each on its own page) in the
// form's layout — Bil, Kod Sekolah, Sekolah, Negeri/Negara, Jantina (L/P),
// Bangsa (Melayu/Cina/India/Lain-lain), Jumlah (Murid/Guru).

const HEAD_FILL = "E2E8F0";
const FOOT_FILL = "F1F5F9";
const border = { style: BorderStyle.SINGLE, size: 4, color: "64748B" };
const borders = { top: border, bottom: border, left: border, right: border };

const fmt = (v: number) => (v ? v.toLocaleString("en-MY") : "–");

function cell(text: string, o: {
  bold?: boolean; head?: boolean; foot?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  colSpan?: number; rowSpan?: number; size?: number; width?: number;
} = {}) {
  return new TableCell({
    borders,
    columnSpan: o.colSpan,
    rowSpan: o.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    shading: o.head ? { type: ShadingType.CLEAR, fill: HEAD_FILL, color: "auto" } : o.foot ? { type: ShadingType.CLEAR, fill: FOOT_FILL, color: "auto" } : undefined,
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: o.align ?? (o.head ? AlignmentType.CENTER : AlignmentType.LEFT),
      children: [new TextRun({ text, bold: o.bold || o.head, size: o.size ?? (o.head ? 16 : 17), font: "Arial" })],
    })],
  });
}

const num = (v: number, bold = false, foot = false) => cell(fmt(v), { align: AlignmentType.CENTER, bold, foot });

const tallyCells = (t: Tally, bold = false, foot = false) => [
  num(t.male, bold, foot), num(t.female, bold, foot),
  num(t.melayu, bold, foot), num(t.cina, bold, foot), num(t.india, bold, foot), num(t.lain, bold, foot),
  num(t.murid, true, foot), num(t.guru, true, foot),
];

// Landscape A4 with 10 mm margins: 277 mm of text width ≈ 14 570 twips.
const TEXT_W = 14570;
const TALLY_W = [560, 560, 900, 760, 760, 900, 820, 820];

function headRows(lead: { text: string; width: number }[]) {
  return [
    new TableRow({
      tableHeader: true,
      children: [
        ...lead.map(l => cell(l.text.toUpperCase(), { head: true, rowSpan: 2, width: l.width })),
        cell("JANTINA", { head: true, colSpan: 2 }),
        cell("BANGSA", { head: true, colSpan: 4 }),
        cell("JUMLAH", { head: true, colSpan: 2 }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: ["L", "P", "MELAYU", "CINA", "INDIA", "LAIN-LAIN", "MURID", "GURU"]
        .map((t, i) => cell(t, { head: true, width: TALLY_W[i] })),
    }),
  ];
}

function table(lead: { text: string; width: number }[], rows: TableRow[]) {
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [...lead.map(l => l.width), ...TALLY_W],
    rows: [...headRows(lead), ...rows],
  });
}

function competitionTable(g: CompetitionGroup) {
  const lead = [
    { text: "Bil", width: 560 }, { text: "Kod Sekolah", width: 1400 },
    { text: "Sekolah", width: 4630 }, { text: "Negeri / Negara", width: 1900 },
  ];
  return table(lead, [
    ...g.rows.map((r, i) => new TableRow({
      cantSplit: true,
      children: [
        cell(String(i + 1), { align: AlignmentType.CENTER }),
        cell(r.schoolCode ?? "–"),
        cell(r.name),
        cell(r.international ? `${r.region} (Antarabangsa)` : r.region),
        ...tallyCells(r),
      ],
    })),
    new TableRow({
      cantSplit: true,
      children: [cell("JUMLAH", { bold: true, foot: true, colSpan: 4, align: AlignmentType.CENTER }), ...tallyCells(g.total, true, true)],
    }),
  ]);
}

const para = (text: string, o: { bold?: boolean; size?: number; color?: string; before?: number; after?: number; pageBreak?: boolean } = {}) =>
  new Paragraph({
    pageBreakBefore: o.pageBreak,
    spacing: { before: o.before ?? 0, after: o.after ?? 80 },
    children: [new TextRun({ text, bold: o.bold, size: o.size ?? 20, color: o.color, font: "Arial" })],
  });

/** The Word document for a computed attendance list. */
export async function buildAttendanceListDocx(d: AttendanceListData): Promise<Buffer> {
  const basis = d.basis;
  const asAt = new Date(d.generatedAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
  const schoolSum = d.groups.reduce((s, g) => s + g.rows.length, 0);

  const summary = table(
    [{ text: "Bil", width: 560 }, { text: "Kod", width: 1100 }, { text: "Pertandingan", width: 5930 }, { text: "Sekolah", width: 900 }],
    [
      ...d.groups.map((g, i) => new TableRow({
        cantSplit: true,
        children: [
          cell(String(i + 1), { align: AlignmentType.CENTER }),
          cell(g.code),
          cell(g.walkIn ? `${g.name} (Walk-in)` : g.name),
          num(g.rows.length),
          ...tallyCells(g.total),
        ],
      })),
      new TableRow({
        cantSplit: true,
        children: [
          cell("JUMLAH", { bold: true, foot: true, colSpan: 3, align: AlignmentType.CENTER }),
          num(schoolSum, true, true),
          ...tallyCells(d.total, true, true),
        ],
      }),
    ],
  );

  const children: (Paragraph | Table)[] = [
    para("SENARAI KEHADIRAN PENYERTAAN", { bold: true, size: 18, color: "64748B" }),
    para(d.eventName.toUpperCase(), { bold: true, size: 30, after: 60 }),
    para(
      `Pertandingan ${LIST_MODE_LABEL[d.mode]} · Snapshot data setakat ${asAt}` +
      (d.mode === "BERSEMUKA" ? ` · Asas kehadiran: ${basis === "individual" ? "Individu" : "Kaunter"}` : ""),
      { size: 18, color: "475569", after: 160 },
    ),
    para(
      `${d.groups.length} pertandingan · ${d.total.schools.toLocaleString("en-MY")} sekolah / kontinjen · ` +
      `${d.total.murid.toLocaleString("en-MY")} penyertaan murid · ${d.total.guru.toLocaleString("en-MY")} guru · ` +
      `${d.total.internationalMurid.toLocaleString("en-MY")} murid antarabangsa`,
      { bold: true, size: 20, after: 160 },
    ),
    para("RINGKASAN MENGIKUT PERTANDINGAN", { bold: true, size: 22, after: 100 }),
    summary,
    para(attendanceListNote(d), { size: 16, color: "64748B", before: 120 }),
  ];

  d.groups.forEach((g, i) => {
    children.push(
      para(`${i + 1}. ${g.code} ${g.name}${g.walkIn ? " (Walk-in)" : ""}`.toUpperCase(), { bold: true, size: 22, pageBreak: true, after: 40 }),
      para(`${g.rows.length} sekolah · ${g.total.murid} murid · ${g.total.guru} guru`, { size: 17, color: "64748B", after: 100 }),
      competitionTable(g),
    );
  });
  if (!d.groups.length) children.push(para("Tiada kehadiran direkodkan.", { before: 200 }));

  const m = convertMillimetersToTwip(10);
  const doc = new Document({
    creator: "Techlympics",
    title: "Senarai Kehadiran Penyertaan",
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: { top: m, bottom: m, left: m, right: m },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
