import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { getOrganizerSession } from "@/lib/auth/session";
import { computeFinalProgramData } from "@/lib/reports/finalProgramData";
import type { StateStat, CompStat } from "@/lib/reports/finalProgramData";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  ImageRun, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip, Header,
} from "docx";

// ─── colour palette ────────────────────────────────────────────────────────────
const DARK   = "1E293B";
const BLUE   = "1D4ED8";
const LBLUE  = "DBEAFE";
const GREY   = "F1F5F9";
const GREEN  = "D1FAE5";
const YELLOW = "FEF9C3";
const ORANGE = "FED7AA";
const WHITE  = "FFFFFF";
const TOTBG  = "1E3A8A";
const GRNCOL = "065F46";

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" } as const;
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

type Shade = { fill: string; type: typeof ShadingType.CLEAR; color: "auto" };
const shade = (fill: string): Shade => ({ type: ShadingType.CLEAR, fill, color: "auto" });

function hCell(text: string, bg = BLUE, colspan = 1): TableCell {
  return new TableCell({
    columnSpan: colspan,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
    })],
    shading: shade(bg),
    borders: BORDERS,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function dCell(
  text: string | number,
  bg = WHITE,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
  color = "374151",
  colspan = 1,
): TableCell {
  return new TableCell({
    columnSpan: colspan,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text), size: 18, bold, color })],
    })],
    shading: shade(bg),
    borders: BORDERS,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: BLUE })],
  });
}

function pct(n: number, total: number): string {
  return total ? (n / total * 100).toFixed(1) + "%" : "0.0%";
}

// ─── route ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const data = await computeFinalProgramData(eventId);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const d = data;
  const grandTotal = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants + d.walkInSummary.total;
  const generated  = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });

  // ── Load logo (SVG → PNG via sharp/rsvg) ────────────────────────────────────
  let logoImage: Buffer | undefined;
  try {
    const svgBuffer = readFileSync(join(process.cwd(), "public", "logo-mt.svg"));
    logoImage = await sharp(svgBuffer)
      .resize(320, null, { fit: "inside" })
      .png()
      .toBuffer();
  } catch { /* skip if missing */ }

  // ── Cover header table ──────────────────────────────────────────────────────
  const coverChildren: (Paragraph | Table)[] = [];

  if (logoImage) {
    // Logo + title side by side in a table
    const logoCell = new TableCell({
      width: { size: 1200, type: WidthType.DXA },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: logoImage, transformation: { width: 160, height: 50 }, type: "png" })],
      })],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      verticalAlign: "center",
    });
    const titleCell = new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 0 },
          children: [new TextRun({ text: "LAPORAN AKHIR PROGRAM", bold: true, size: 36, color: DARK })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 0 },
          children: [new TextRun({ text: d.eventName.toUpperCase(), bold: true, size: 26, color: BLUE })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [
            new TextRun({ text: d.locationLabel.toUpperCase(), size: 22, color: "64748B" }),
            new TextRun({ text: "     |     ", size: 22, color: "CBD5E1" }),
            new TextRun({ text: `Dijana: ${generated}`, size: 20, color: "9CA3AF" }),
          ],
        }),
      ],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      verticalAlign: "center",
    });
    coverChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [logoCell, titleCell] })],
      }),
    );
  } else {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "LAPORAN AKHIR PROGRAM", bold: true, size: 36, color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: d.eventName.toUpperCase(), bold: true, size: 26, color: BLUE })],
      }),
    );
  }

  coverChildren.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  // ── 1. Ringkasan (summary) ─────────────────────────────────────────────────
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("KATEGORI"), hCell("PELAJAR"), hCell("BELIA"), hCell("JUMLAH")] }),
      new TableRow({ children: [
        dCell("Kontinjen Sekolah / Belia", GREY, AlignmentType.LEFT, true),
        dCell(d.regSummary.schoolContingents, GREY, AlignmentType.RIGHT, true),
        dCell(d.regSummary.beliaContingents,  GREY, AlignmentType.RIGHT, true),
        dCell(d.regSummary.schoolContingents + d.regSummary.beliaContingents, GREY, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("  Sekolah Rendah", GREEN), dCell(d.regSummary.rendahContingents, GREEN, AlignmentType.RIGHT), dCell("—", GREEN, AlignmentType.CENTER), dCell(d.regSummary.rendahContingents, GREEN, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("  Sekolah Menengah", YELLOW), dCell(d.regSummary.menengahContingents, YELLOW, AlignmentType.RIGHT), dCell("—", YELLOW, AlignmentType.CENTER), dCell(d.regSummary.menengahContingents, YELLOW, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("  Belia", LBLUE), dCell("—", LBLUE, AlignmentType.CENTER), dCell(d.regSummary.beliaContingents, LBLUE, AlignmentType.RIGHT), dCell(d.regSummary.beliaContingents, LBLUE, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Pasukan (Berdaftar)", WHITE),
        dCell(d.regSummary.schoolTeams, WHITE, AlignmentType.RIGHT),
        dCell(d.regSummary.beliaTeams,  WHITE, AlignmentType.RIGHT),
        dCell(d.regSummary.schoolTeams + d.regSummary.beliaTeams, WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Peserta (Berdaftar)", GREY),
        dCell(d.regSummary.schoolParticipants, GREY, AlignmentType.RIGHT),
        dCell(d.regSummary.beliaParticipants,  GREY, AlignmentType.RIGHT),
        dCell(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants, GREY, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Peserta (Walk-In)", WHITE),
        dCell(d.walkInSummary.schoolParticipants || "—", WHITE, AlignmentType.RIGHT),
        dCell(d.walkInSummary.beliaParticipants  || "—", WHITE, AlignmentType.RIGHT),
        dCell(d.walkInSummary.total || "—", WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("JUMLAH KESELURUHAN (Berdaftar + Walk-In)", ORANGE, AlignmentType.LEFT, true),
        dCell("", ORANGE),
        dCell("", ORANGE),
        dCell(grandTotal, ORANGE, AlignmentType.RIGHT, true, "92400E"),
      ]}),
    ],
  });

  // ── 2. Gender ──────────────────────────────────────────────────────────────
  const genderTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("JANTINA"), hCell("PELAJAR SEKOLAH"), hCell("BELIA")] }),
      new TableRow({ children: [
        dCell("Lelaki",    "BFDBFE", AlignmentType.LEFT, true),
        dCell(`${d.schoolMale} (${pct(d.schoolMale, d.schoolMale + d.schoolFemale)})`, "BFDBFE", AlignmentType.RIGHT),
        dCell(`${d.beliaMale} (${pct(d.beliaMale, d.beliaMale + d.beliaFemale)})`, "BFDBFE", AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("Perempuan", "FBCFE8", AlignmentType.LEFT, true),
        dCell(`${d.schoolFemale} (${pct(d.schoolFemale, d.schoolMale + d.schoolFemale)})`, "FBCFE8", AlignmentType.RIGHT),
        dCell(`${d.beliaFemale} (${pct(d.beliaFemale, d.beliaMale + d.beliaFemale)})`, "FBCFE8", AlignmentType.RIGHT),
      ]}),
    ],
  });

  // ── 3. Ethnicity ───────────────────────────────────────────────────────────
  const ethnTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        hCell("Melayu", GRNCOL), hCell("Cina", GRNCOL), hCell("India", GRNCOL),
        hCell("Org. Asli", GRNCOL), hCell("Lain-Lain", GRNCOL), hCell("Sabah (Bumi)", GRNCOL), hCell("Sarawak (Bumi)", GRNCOL),
      ]}),
      new TableRow({ children: [
        dCell(d.ethnicityStats.melayu,  GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.cina,    GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.india,   GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.orgAsli, GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.lainLain,GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.sabah,   GREEN, AlignmentType.CENTER, true),
        dCell(d.ethnicityStats.sarawak, GREEN, AlignmentType.CENTER, true),
      ]}),
    ],
  });

  // ── 4. State detail table ──────────────────────────────────────────────────
  const STATE_FILLS = [ORANGE, YELLOW, GREEN, LBLUE, "EDE9FE", "FCE7F3", "CCFBF1", "FEE2E2"];
  const stateRows: TableRow[] = [
    new TableRow({ children: [
      hCell("NEGERI"), hCell("KON. SEKOLAH"), hCell("RENDAH"), hCell("MENENGAH"),
      hCell("KON. BELIA"), hCell("PASUKAN"), hCell("PESERTA"), hCell("LELAKI"), hCell("PEREMPUAN"),
    ]}),
  ];
  d.stateStats.forEach((s: StateStat, i: number) => {
    const bg = STATE_FILLS[i % STATE_FILLS.length];
    stateRows.push(new TableRow({ children: [
      dCell(s.stateName,   bg, AlignmentType.LEFT, true),
      dCell(s.schoolC,     bg, AlignmentType.RIGHT, true),
      dCell(s.rendahC,     bg, AlignmentType.RIGHT),
      dCell(s.menengahC,   bg, AlignmentType.RIGHT),
      dCell(s.beliaC,      bg, AlignmentType.RIGHT),
      dCell(s.totalTeams,  bg, AlignmentType.RIGHT, true),
      dCell(s.participants,bg, AlignmentType.RIGHT, true),
      dCell(s.male,        bg, AlignmentType.RIGHT),
      dCell(s.female,      bg, AlignmentType.RIGHT),
    ]}));
  });
  const tot = d.stateStats.reduce((acc, s) => ({
    schoolC: acc.schoolC + s.schoolC, rendahC: acc.rendahC + s.rendahC,
    menengahC: acc.menengahC + s.menengahC, beliaC: acc.beliaC + s.beliaC,
    totalTeams: acc.totalTeams + s.totalTeams, participants: acc.participants + s.participants,
    male: acc.male + s.male, female: acc.female + s.female,
  }), { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 });
  stateRows.push(new TableRow({ children: [
    dCell("JUMLAH", TOTBG, AlignmentType.LEFT, true, WHITE),
    dCell(tot.schoolC, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.rendahC, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.menengahC, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.beliaC, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.totalTeams, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.participants, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.male, TOTBG, AlignmentType.RIGHT, true, WHITE),
    dCell(tot.female, TOTBG, AlignmentType.RIGHT, true, WHITE),
  ]}));
  const stateTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: stateRows });

  // ── 5. By education level ──────────────────────────────────────────────────
  const levelRows: TableRow[] = [
    new TableRow({ children: [hCell("TAHAP PENDIDIKAN"), hCell("KOD"), hCell("PERTANDINGAN"), hCell("PASUKAN"), hCell("PESERTA")] }),
  ];
  const levelGroups = [
    { label: "Sekolah Rendah",   comps: d.rendahComps,   hBg: "A7F3D0", rBg: GREEN  },
    { label: "Sekolah Menengah", comps: d.menengahComps, hBg: "FDE68A", rBg: YELLOW },
    { label: "Belia",            comps: d.beliaComps,    hBg: "93C5FD", rBg: LBLUE  },
  ];
  for (const g of levelGroups) {
    if (!g.comps.length) continue;
    levelRows.push(new TableRow({ children: [dCell(g.label, g.hBg, AlignmentType.LEFT, true, DARK, 5)] }));
    g.comps.forEach((c: CompStat, i: number) => {
      const bg = i % 2 === 0 ? WHITE : GREY;
      levelRows.push(new TableRow({ children: [
        dCell("", bg), dCell(c.code, bg, AlignmentType.CENTER), dCell(c.name, bg),
        dCell(c.teams, bg, AlignmentType.RIGHT), dCell(c.participants, bg, AlignmentType.RIGHT),
      ]}));
    });
    const subT = g.comps.reduce((s, c) => s + c.teams, 0);
    const subP = g.comps.reduce((s, c) => s + c.participants, 0);
    levelRows.push(new TableRow({ children: [
      dCell("", g.hBg), dCell("", g.hBg), dCell(`Jumlah ${g.label}`, g.hBg, AlignmentType.RIGHT, true),
      dCell(subT, g.hBg, AlignmentType.RIGHT, true), dCell(subP, g.hBg, AlignmentType.RIGHT, true),
    ]}));
  }
  const levelTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: levelRows });

  // ── 6. By state × competition ──────────────────────────────────────────────
  const scRows: TableRow[] = [
    new TableRow({ children: [hCell("NEGERI"), hCell("KOD"), hCell("PERTANDINGAN"), hCell("PASUKAN"), hCell("PESERTA")] }),
  ];
  d.stateCompStats.forEach((sg, si) => {
    const bg = STATE_FILLS[si % STATE_FILLS.length];
    scRows.push(new TableRow({ children: [dCell(sg.stateName, bg, AlignmentType.LEFT, true, DARK, 5)] }));
    sg.comps.forEach((c, i) => {
      const rowBg = i % 2 === 0 ? WHITE : GREY;
      scRows.push(new TableRow({ children: [
        dCell("", rowBg), dCell(c.code, rowBg, AlignmentType.CENTER), dCell(c.name, rowBg),
        dCell(c.teams, rowBg, AlignmentType.RIGHT), dCell(c.participants, rowBg, AlignmentType.RIGHT),
      ]}));
    });
    const subT = sg.comps.reduce((s, c) => s + c.teams, 0);
    const subP = sg.comps.reduce((s, c) => s + c.participants, 0);
    scRows.push(new TableRow({ children: [
      dCell("", bg), dCell("", bg), dCell(`Jumlah ${sg.stateName}`, bg, AlignmentType.RIGHT, true),
      dCell(subT, bg, AlignmentType.RIGHT, true), dCell(subP, bg, AlignmentType.RIGHT, true),
    ]}));
  });
  const scTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: scRows });

  // ── Assemble document ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: {
            top: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(1.0),
            right: convertInchesToTwip(1.0),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${d.eventName}  |  Laporan Akhir Program`, size: 16, color: "94A3B8" })],
          })],
        }),
      },
      children: [
        ...coverChildren,

        sectionTitle("1. Ringkasan Penyertaan"),
        summaryTable,
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        sectionTitle("2. Pecahan Jantina"),
        genderTable,
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        sectionTitle("3. Pecahan Kaum (Bagi Laporan KBS / Rakan Muda)"),
        ethnTable,
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        sectionTitle("4. Laporan Terperinci Mengikut Negeri"),
        stateTable,
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        sectionTitle("5. Penyertaan Mengikut Tahap Pendidikan"),
        levelTable,
        new Paragraph({ spacing: { after: 200 }, children: [] }),

        sectionTitle("6. Penyertaan Mengikut Negeri"),
        scTable,

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: "9CA3AF", italics: true })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = `Laporan-Akhir-Program-${d.slug}.docx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
