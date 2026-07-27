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

// ─── Tabloid colour palette ────────────────────────────────────────────────────
const SLATE_900  = "0F172A";   // mastheads, grand-total rows
const SLATE_800  = "1E293B";   // sub-headers
const SLATE_700  = "334155";   // column headers, state-name cells
const SLATE_400  = "94A3B8";   // eyebrow / muted text
const SLATE_200  = "E2E8F0";   // sub-total rows
const SLATE_100  = "F1F5F9";   // even data rows
const SLATE_50   = "F8FAFC";   // alternate light row
const WHITE      = "FFFFFF";
const TEXT_DARK  = "0F172A";   // body text

const INDIGO_800 = "3730A3";   // Sekolah Rendah label
const INDIGO_50  = "EEF2FF";   // Rendah data rows / Lelaki
const INDIGO_100 = "E0E7FF";   // Rendah sub-total
const AMBER_800  = "92400E";   // Sekolah Menengah label
const AMBER_50   = "FFFBEB";   // Menengah data rows
const AMBER_100  = "FEF3C7";   // Menengah sub-total
const TEAL_800   = "115E59";   // Belia label
const TEAL_50    = "F0FDFA";   // Belia data rows
const TEAL_100   = "CCFBF1";   // Belia sub-total
const ROSE_50    = "FFF1F2";   // Perempuan
const MAROON     = "7B0D1E";   // Penyertaan dan Penglibatan header

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Shade = { fill: string; type: typeof ShadingType.CLEAR; color: "auto" };
const shade = (fill: string): Shade => ({ type: ShadingType.CLEAR, fill, color: "auto" });

// No-border constant
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NB, bottom: NB, left: NB, right: NB };

// Zero suppression
function nv(value: number): string {
  return value === 0 ? "" : value.toLocaleString();
}

function pct(num: number, total: number): string {
  return total ? (num / total * 100).toFixed(1) + "%" : "";
}

// Column header cell — slate-700 background, white text
function hCell(text: string, bg = SLATE_700, colspan = 1): TableCell {
  return new TableCell({
    columnSpan: colspan,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: text.toUpperCase(), bold: true, color: WHITE, size: 16 })],
    })],
    shading: shade(bg),
    borders: NO_BORDERS,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

// Data cell
function dCell(
  text: string | number,
  bg = WHITE,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
  color = TEXT_DARK,
  colspan = 1,
): TableCell {
  return new TableCell({
    columnSpan: colspan,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text), size: 18, bold, color })],
    })],
    shading: shade(bg),
    borders: NO_BORDERS,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
  });
}

// Dark masthead banner (eyebrow + title) — rendered as a single-cell full-width table
function sectionMasthead(eyebrow: string, title: string, bg = SLATE_900): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      children: [new TableCell({
        shading: shade(bg),
        borders: NO_BORDERS,
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        children: [
          ...(eyebrow ? [new Paragraph({
            spacing: { after: 20 },
            children: [new TextRun({ text: eyebrow.toUpperCase(), size: 14, color: SLATE_400, bold: true })],
          })] : []),
          new Paragraph({
            children: [new TextRun({ text: title.toUpperCase(), size: 22, color: WHITE, bold: true })],
          }),
        ],
      })],
    })],
  });
}

// Sub-section label (slate-800 bar)
function subHeader(text: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      children: [new TableCell({
        shading: shade(SLATE_800),
        borders: NO_BORDERS,
        margins: { top: 50, bottom: 50, left: 140, right: 140 },
        children: [new Paragraph({
          children: [new TextRun({ text: text.toUpperCase(), size: 16, color: WHITE, bold: true })],
        })],
      })],
    })],
  });
}

const GAP = new Paragraph({ spacing: { after: 160 }, children: [] });
const SMALL_GAP = new Paragraph({ spacing: { after: 80 }, children: [] });

// ─── Route ────────────────────────────────────────────────────────────────────

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
  const pesertaUtama  = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants;
  const jumlahPeserta = pesertaUtama + d.walkInSummary.total;
  const grandTotal    = jumlahPeserta + d.trainerCount;
  const generated  = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });

  // ── Logo ────────────────────────────────────────────────────────────────────
  let logoImage: Buffer | undefined;
  try {
    const svgBuffer = readFileSync(join(process.cwd(), "public", "logo-mt.svg"));
    logoImage = await sharp(svgBuffer).resize(320, null, { fit: "inside" }).png().toBuffer();
  } catch { /* skip if missing */ }

  // ── Cover header ────────────────────────────────────────────────────────────
  const coverChildren: (Paragraph | Table)[] = [];

  if (logoImage) {
    const logoCell = new TableCell({
      width: { size: 1400, type: WidthType.DXA },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: logoImage, transformation: { width: 160, height: 50 }, type: "png" })],
      })],
      borders: NO_BORDERS,
      verticalAlign: "center",
    });
    const titleCell = new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 0 },
          children: [new TextRun({ text: "LAPORAN AKHIR PROGRAM", bold: true, size: 36, color: SLATE_900 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 0 },
          children: [new TextRun({ text: d.eventName.toUpperCase(), bold: true, size: 26, color: SLATE_700 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [
            new TextRun({ text: d.locationLabel.toUpperCase(), size: 20, color: SLATE_400 }),
            new TextRun({ text: "     |     ", size: 20, color: SLATE_200 }),
            new TextRun({ text: `Dijana: ${generated}`, size: 18, color: SLATE_400 }),
          ],
        }),
      ],
      borders: NO_BORDERS,
      verticalAlign: "center",
    });
    coverChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [new TableRow({ children: [logoCell, titleCell] })],
      }),
    );
  } else {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "LAPORAN AKHIR PROGRAM", bold: true, size: 36, color: SLATE_900 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: d.eventName.toUpperCase(), bold: true, size: 26, color: SLATE_700 })],
      }),
    );
  }
  coverChildren.push(GAP);

  // ── 0. Ringkasan Keseluruhan ────────────────────────────────────────────────
  const overallTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [
        hCell("Kategori Penyertaan / Penglibatan"),
        hCell("Jumlah"),
      ]}),
      new TableRow({ children: [
        dCell("1. Peserta Utama", WHITE, AlignmentType.LEFT),
        dCell(nv(pesertaUtama), WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("2. Peserta Walk-in", SLATE_50, AlignmentType.LEFT),
        dCell(nv(d.walkInSummary.total), SLATE_50, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("3. Jurulatih", WHITE, AlignmentType.LEFT),
        dCell(nv(d.trainerCount), WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("JUMLAH KESELURUHAN PENYERTAAN DAN PENGLIBATAN", SLATE_900, AlignmentType.LEFT, true, WHITE),
        dCell(String(grandTotal.toLocaleString()), SLATE_900, AlignmentType.RIGHT, true, WHITE),
      ]}),
    ],
  });

  // ── 1. Ringkasan ────────────────────────────────────────────────────────────
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [hCell("Kategori"), hCell("Pelajar"), hCell("Belia"), hCell("Jumlah")] }),
      new TableRow({ children: [
        dCell("Kontinjen Sekolah / Belia", SLATE_100, AlignmentType.LEFT, true),
        dCell(nv(d.regSummary.schoolContingents), SLATE_100, AlignmentType.RIGHT, true),
        dCell(nv(d.regSummary.beliaContingents),  SLATE_100, AlignmentType.RIGHT, true),
        dCell(nv(d.regSummary.schoolContingents + d.regSummary.beliaContingents), SLATE_100, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("  ↳ Sekolah Rendah", INDIGO_50),
        dCell(nv(d.regSummary.rendahContingents), INDIGO_50, AlignmentType.RIGHT),
        dCell("—", INDIGO_50, AlignmentType.CENTER),
        dCell(nv(d.regSummary.rendahContingents), INDIGO_50, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("  ↳ Sekolah Menengah", AMBER_50),
        dCell(nv(d.regSummary.menengahContingents), AMBER_50, AlignmentType.RIGHT),
        dCell("—", AMBER_50, AlignmentType.CENTER),
        dCell(nv(d.regSummary.menengahContingents), AMBER_50, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("  ↳ Belia", TEAL_50),
        dCell("—", TEAL_50, AlignmentType.CENTER),
        dCell(nv(d.regSummary.beliaContingents), TEAL_50, AlignmentType.RIGHT),
        dCell(nv(d.regSummary.beliaContingents), TEAL_50, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Pasukan (Berdaftar)", WHITE),
        dCell(nv(d.regSummary.schoolTeams), WHITE, AlignmentType.RIGHT),
        dCell(nv(d.regSummary.beliaTeams),  WHITE, AlignmentType.RIGHT),
        dCell(nv(d.regSummary.schoolTeams + d.regSummary.beliaTeams), WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Peserta (Berdaftar)", SLATE_50),
        dCell(nv(d.regSummary.schoolParticipants), SLATE_50, AlignmentType.RIGHT),
        dCell(nv(d.regSummary.beliaParticipants),  SLATE_50, AlignmentType.RIGHT),
        dCell(nv(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants), SLATE_50, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("Jumlah Peserta (Walk-In)", WHITE),
        dCell(nv(d.walkInSummary.schoolParticipants), WHITE, AlignmentType.RIGHT),
        dCell(nv(d.walkInSummary.beliaParticipants),  WHITE, AlignmentType.RIGHT),
        dCell(nv(d.walkInSummary.total), WHITE, AlignmentType.RIGHT, true),
      ]}),
      new TableRow({ children: [
        dCell("JUMLAH KESELURUHAN (Berdaftar + Walk-In)", SLATE_900, AlignmentType.LEFT, true, WHITE),
        dCell("", SLATE_900),
        dCell("", SLATE_900),
        dCell(nv(jumlahPeserta), SLATE_900, AlignmentType.RIGHT, true, WHITE),
      ]}),
    ],
  });

  // ── 2. Gender ──────────────────────────────────────────────────────────────
  const genderTable = new Table({
    width: { size: 70, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [hCell("Jantina"), hCell("Pelajar Sekolah"), hCell("Belia")] }),
      new TableRow({ children: [
        dCell("Lelaki",    INDIGO_50, AlignmentType.LEFT, true),
        dCell(`${nv(d.schoolMale)} (${pct(d.schoolMale, d.schoolMale + d.schoolFemale)})`, INDIGO_50, AlignmentType.RIGHT),
        dCell(`${nv(d.beliaMale)} (${pct(d.beliaMale, d.beliaMale + d.beliaFemale)})`,   INDIGO_50, AlignmentType.RIGHT),
      ]}),
      new TableRow({ children: [
        dCell("Perempuan", ROSE_50, AlignmentType.LEFT, true),
        dCell(`${nv(d.schoolFemale)} (${pct(d.schoolFemale, d.schoolMale + d.schoolFemale)})`, ROSE_50, AlignmentType.RIGHT),
        dCell(`${nv(d.beliaFemale)} (${pct(d.beliaFemale, d.beliaMale + d.beliaFemale)})`,   ROSE_50, AlignmentType.RIGHT),
      ]}),
    ],
  });

  // ── 3. Ethnicity (KAUM) — Berdaftar + Walk-In groups ──────────────────────
  const ethnLabels3 = ["Melayu", "Cina", "India", "Org. Asli", "Sabah", "Sarawak", "Lain-Lain"];
  const regEthnVals3 = [d.ethnicityStats.melayu, d.ethnicityStats.cina, d.ethnicityStats.india,
    d.ethnicityStats.orgAsli, d.ethnicityStats.sabah, d.ethnicityStats.sarawak, d.ethnicityStats.lainLain];
  const wiEthnVals3  = [d.walkInEthnicityStats.melayu, d.walkInEthnicityStats.cina, d.walkInEthnicityStats.india,
    d.walkInEthnicityStats.orgAsli, d.walkInEthnicityStats.sabah, d.walkInEthnicityStats.sarawak, d.walkInEthnicityStats.lainLain];
  const regEthnTotal3  = regEthnVals3.reduce((s, v) => s + v, 0);
  const wiEthnTotal3   = wiEthnVals3.reduce((s, v) => s + v, 0);
  const ethnGrandTotal3 = regEthnTotal3 + wiEthnTotal3;
  const ECSPAN = ethnLabels3.length;

  const ethnRows: TableRow[] = [
    new TableRow({ children: ethnLabels3.map(l => hCell(l)) }),
    // Berdaftar group
    new TableRow({ children: [dCell("Peserta Berdaftar", SLATE_800, AlignmentType.LEFT, true, WHITE, ECSPAN)] }),
    new TableRow({ children: regEthnVals3.map(v => dCell(nv(v), WHITE, AlignmentType.CENTER, true)) }),
    new TableRow({ children: regEthnVals3.map(v => dCell(
      regEthnTotal3 ? `${(v / regEthnTotal3 * 100).toFixed(1)}%` : "", SLATE_50, AlignmentType.CENTER, false, SLATE_400,
    ))}),
    new TableRow({ children: [dCell(`Jumlah Berdaftar: ${regEthnTotal3}`, SLATE_200, AlignmentType.RIGHT, true, TEXT_DARK, ECSPAN)] }),
  ];
  if (wiEthnTotal3 > 0) {
    ethnRows.push(
      new TableRow({ children: [dCell("Peserta Walk-In", SLATE_800, AlignmentType.LEFT, true, WHITE, ECSPAN)] }),
      new TableRow({ children: wiEthnVals3.map(v => dCell(nv(v), WHITE, AlignmentType.CENTER, true)) }),
      new TableRow({ children: wiEthnVals3.map(v => dCell(
        wiEthnTotal3 ? `${(v / wiEthnTotal3 * 100).toFixed(1)}%` : "", SLATE_50, AlignmentType.CENTER, false, SLATE_400,
      ))}),
      new TableRow({ children: [dCell(`Jumlah Walk-In: ${wiEthnTotal3}`, SLATE_200, AlignmentType.RIGHT, true, TEXT_DARK, ECSPAN)] }),
    );
  }
  ethnRows.push(new TableRow({ children: [dCell(`Jumlah Keseluruhan: ${ethnGrandTotal3}`, SLATE_900, AlignmentType.RIGHT, true, WHITE, ECSPAN)] }));
  const ethnTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: ethnRows,
  });

  // ── 4. State detail table ──────────────────────────────────────────────────
  const stateRows: TableRow[] = [
    new TableRow({ children: [
      hCell("Negeri"), hCell("Kont. Sekolah"), hCell("Sek. Rendah"), hCell("Sek. Menengah"),
      hCell("Kont. Belia"), hCell("Pasukan"), hCell("Peserta"), hCell("Lelaki"), hCell("Perempuan"),
    ]}),
  ];
  d.stateStats.forEach((s: StateStat, i: number) => {
    const rowBg = i % 2 === 0 ? WHITE : SLATE_50;
    stateRows.push(new TableRow({ children: [
      dCell(s.stateName,    SLATE_700, AlignmentType.LEFT,  true, WHITE),
      dCell(nv(s.schoolC),  rowBg, AlignmentType.RIGHT, true),
      dCell(nv(s.rendahC),  rowBg, AlignmentType.RIGHT),
      dCell(nv(s.menengahC),rowBg, AlignmentType.RIGHT),
      dCell(nv(s.beliaC),   rowBg, AlignmentType.RIGHT),
      dCell(nv(s.totalTeams),  rowBg, AlignmentType.RIGHT, true),
      dCell(nv(s.participants),rowBg, AlignmentType.RIGHT, true),
      dCell(nv(s.male),     rowBg, AlignmentType.RIGHT),
      dCell(nv(s.female),   rowBg, AlignmentType.RIGHT),
    ]}));
  });
  const tot = d.stateStats.reduce((acc, s) => ({
    schoolC:    acc.schoolC    + s.schoolC,
    rendahC:    acc.rendahC    + s.rendahC,
    menengahC:  acc.menengahC  + s.menengahC,
    beliaC:     acc.beliaC     + s.beliaC,
    totalTeams: acc.totalTeams + s.totalTeams,
    participants: acc.participants + s.participants,
    male:       acc.male       + s.male,
    female:     acc.female     + s.female,
  }), { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 });
  stateRows.push(new TableRow({ children: [
    dCell("JUMLAH",             SLATE_900, AlignmentType.LEFT,  true, WHITE),
    dCell(nv(tot.schoolC),      SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.rendahC),      SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.menengahC),    SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.beliaC),       SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.totalTeams),   SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.participants), SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.male),         SLATE_900, AlignmentType.RIGHT, true, WHITE),
    dCell(nv(tot.female),       SLATE_900, AlignmentType.RIGHT, true, WHITE),
  ]}));
  const stateTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: stateRows });

  // ── 5. By education level ──────────────────────────────────────────────────
  const levelRows: TableRow[] = [
    new TableRow({ children: [hCell("Tahap Pendidikan"), hCell("Kod"), hCell("Pertandingan"), hCell("Pasukan"), hCell("Peserta")] }),
  ];
  const levelGroups = [
    { label: "Sekolah Rendah",   comps: d.rendahComps,   hBg: INDIGO_800, rBg: INDIGO_50,  tBg: INDIGO_100 },
    { label: "Sekolah Menengah", comps: d.menengahComps, hBg: AMBER_800,  rBg: AMBER_50,   tBg: AMBER_100 },
    { label: "Belia",            comps: d.beliaComps,    hBg: TEAL_800,   rBg: TEAL_50,    tBg: TEAL_100 },
  ];
  for (const g of levelGroups) {
    if (!g.comps.length) continue;
    levelRows.push(new TableRow({ children: [dCell(g.label, g.hBg, AlignmentType.LEFT, true, WHITE, 5)] }));
    g.comps.forEach((c: CompStat, i: number) => {
      const bg = i % 2 === 0 ? g.rBg : WHITE;
      levelRows.push(new TableRow({ children: [
        dCell("", bg),
        dCell(c.code, bg, AlignmentType.CENTER),
        dCell(c.name, bg),
        dCell(nv(c.teams), bg, AlignmentType.RIGHT),
        dCell(nv(c.participants), bg, AlignmentType.RIGHT),
      ]}));
    });
    const subT = g.comps.reduce((s, c) => s + c.teams, 0);
    const subP = g.comps.reduce((s, c) => s + c.participants, 0);
    levelRows.push(new TableRow({ children: [
      dCell("", g.tBg), dCell("", g.tBg),
      dCell(`Jumlah ${g.label}`, g.tBg, AlignmentType.RIGHT, true),
      dCell(nv(subT), g.tBg, AlignmentType.RIGHT, true),
      dCell(nv(subP), g.tBg, AlignmentType.RIGHT, true),
    ]}));
  }
  const levelTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: levelRows });

  // ── 6. By state × competition ──────────────────────────────────────────────
  const scRows: TableRow[] = [
    new TableRow({ children: [hCell("Negeri"), hCell("Kod"), hCell("Pertandingan"), hCell("Pasukan"), hCell("Peserta")] }),
  ];
  d.stateCompStats.forEach((sg, si) => {
    const rowBg = si % 2 === 0 ? WHITE : SLATE_50;
    scRows.push(new TableRow({ children: [dCell(sg.stateName, SLATE_700, AlignmentType.LEFT, true, WHITE, 5)] }));
    sg.comps.forEach((c, i) => {
      const bg = i % 2 === 0 ? rowBg : WHITE;
      scRows.push(new TableRow({ children: [
        dCell("", bg),
        dCell(c.code, bg, AlignmentType.CENTER),
        dCell(c.name, bg),
        dCell(nv(c.teams), bg, AlignmentType.RIGHT),
        dCell(nv(c.participants), bg, AlignmentType.RIGHT),
      ]}));
    });
    const subT = sg.comps.reduce((s, c) => s + c.teams, 0);
    const subP = sg.comps.reduce((s, c) => s + c.participants, 0);
    scRows.push(new TableRow({ children: [
      dCell("", SLATE_200), dCell("", SLATE_200),
      dCell(`Jumlah ${sg.stateName}`, SLATE_200, AlignmentType.RIGHT, true),
      dCell(nv(subT), SLATE_200, AlignmentType.RIGHT, true),
      dCell(nv(subP), SLATE_200, AlignmentType.RIGHT, true),
    ]}));
  });
  const scTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: scRows });

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
            children: [new TextRun({ text: `${d.eventName}  |  Laporan Akhir Program`, size: 16, color: SLATE_400 })],
          })],
        }),
      },
      children: [
        ...coverChildren,

        sectionMasthead("Ringkasan Keseluruhan", `Penyertaan dan Penglibatan — ${d.locationLabel}`, MAROON),
        SMALL_GAP,
        overallTable,
        GAP,

        sectionMasthead("Seksyen 1", "Ringkasan Penyertaan"),
        SMALL_GAP,
        subHeader("Berdaftar"),
        summaryTable,
        GAP,

        sectionMasthead("Seksyen 2", "Pecahan Jantina"),
        SMALL_GAP,
        genderTable,
        GAP,

        sectionMasthead("Seksyen 3 — Bagi Laporan KBS / Rakan Muda", "Jumlah Peserta Mengikut Kaum"),
        SMALL_GAP,
        ethnTable,
        GAP,

        sectionMasthead("Seksyen 4", "Laporan Terperinci Mengikut Negeri"),
        SMALL_GAP,
        stateTable,
        GAP,

        sectionMasthead("Seksyen 5", "Penyertaan Mengikut Tahap Pendidikan"),
        SMALL_GAP,
        levelTable,
        GAP,

        ...(d.walkInRendahComps.length > 0 || d.walkInMenengahComps.length > 0 || d.walkInBeliaComps.length > 0 ? [
          sectionMasthead("Walk-In", "Penyertaan Pertandingan Walk-In Mengikut Tahap Pendidikan"),
          SMALL_GAP,
          (() => {
            const wiLevelRows: TableRow[] = [
              new TableRow({ children: [hCell("Tahap Pendidikan"), hCell("Kod"), hCell("Pertandingan"), hCell("—"), hCell("Peserta")] }),
            ];
            const wiLevelGrps3 = [
              { label: "Sekolah Rendah",   comps: d.walkInRendahComps,   hBg: INDIGO_800, rBg: INDIGO_50,  tBg: INDIGO_100 },
              { label: "Sekolah Menengah", comps: d.walkInMenengahComps, hBg: AMBER_800,  rBg: AMBER_50,   tBg: AMBER_100 },
              { label: "Belia",            comps: d.walkInBeliaComps,    hBg: TEAL_800,   rBg: TEAL_50,    tBg: TEAL_100 },
            ];
            for (const g of wiLevelGrps3) {
              if (!g.comps.length) continue;
              wiLevelRows.push(new TableRow({ children: [dCell(g.label, g.hBg, AlignmentType.LEFT, true, WHITE, 5)] }));
              g.comps.forEach((c, i) => {
                const bg = i % 2 === 0 ? g.rBg : WHITE;
                wiLevelRows.push(new TableRow({ children: [
                  dCell("", bg),
                  dCell(c.code, bg, AlignmentType.CENTER),
                  dCell(c.name, bg),
                  dCell("—", bg, AlignmentType.CENTER),
                  dCell(nv(c.participants), bg, AlignmentType.RIGHT),
                ]}));
              });
              const subWIP = g.comps.reduce((s, c) => s + c.participants, 0);
              wiLevelRows.push(new TableRow({ children: [
                dCell("", g.tBg), dCell("", g.tBg),
                dCell(`Jumlah ${g.label}`, g.tBg, AlignmentType.RIGHT, true),
                dCell("", g.tBg),
                dCell(nv(subWIP), g.tBg, AlignmentType.RIGHT, true),
              ]}));
            }
            return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: wiLevelRows });
          })(),
          GAP,
        ] : []),

        sectionMasthead("Seksyen 6", "Penyertaan Mengikut Negeri"),
        SMALL_GAP,
        scTable,

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: SLATE_400, italics: true })],
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
