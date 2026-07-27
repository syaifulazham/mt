import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { computeFinalProgramData, type FinalProgramData } from "@/lib/reports/finalProgramData";
import ExcelJS from "exceljs";

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  // Tabloid theme
  slate900: "0F172A",
  slate800: "1E293B",
  slate700: "334155",
  slate400: "94A3B8",
  slate200: "E2E8F0",
  slate100: "F1F5F9",
  slate50:  "F8FAFC",
  white:    "FFFFFF",
  // Level accents
  indigo800: "3730A3", indigo100: "E0E7FF", indigo50: "EEF2FF",
  amber800:  "92400E", amber100:  "FEF3C7", amber50:  "FFFBEB",
  teal800:   "115E59", teal100:   "CCFBF1", teal50:   "F0FDFA",
  rose50:    "FFF1F2",
  maroon:    "7B0D1E",
};

type Fill = ExcelJS.Fill;
type Alignment = Partial<ExcelJS.Alignment>;

const solidFill  = (hex: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
const center: Alignment = { vertical: "middle", horizontal: "center", wrapText: true };
const left:   Alignment = { vertical: "middle", horizontal: "left",   wrapText: true };
const right:  Alignment = { vertical: "middle", horizontal: "right" };

function nv(v: number): number | string { return v === 0 ? "" : v; }
function pct(n: number, total: number)  { return total ? +(n / total * 100).toFixed(1) : ""; }

// Header cell — slate-700 bg, white bold text
function applyHeader(cell: ExcelJS.Cell, text: string, bg = C.slate700) {
  cell.value = text;
  cell.fill  = solidFill(bg);
  cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.alignment = center;
}

// Masthead cell — slate-900, white bold ALL CAPS
function applyMasthead(cell: ExcelJS.Cell, text: string, bg = C.slate900) {
  cell.value = text.toUpperCase();
  cell.fill  = solidFill(bg);
  cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cell.alignment = center;
}

// Data cell
function applyCell(
  cell: ExcelJS.Cell,
  value: string | number,
  bg = C.white,
  align: Alignment = left,
  bold = false,
  color = C.slate900,
) {
  cell.value = value;
  cell.fill  = solidFill(bg);
  cell.font  = { size: 10, bold, color: { argb: "FF" + color } };
  cell.alignment = align;
}

// ─── Single-sheet builder ─────────────────────────────────────────────────────
function buildSingleSheet(wb: ExcelJS.Workbook, d: FinalProgramData) {
  const ws = wb.addWorksheet("Laporan Akhir Program");
  const pesertaUtama  = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants;
  const jumlahPeserta = pesertaUtama + d.walkInSummary.total;
  const grandTotal    = jumlahPeserta + d.trainerCount;

  // 9 columns — wide enough for the state-detail section
  ws.columns = [
    { width: 32 }, { width: 16 }, { width: 14 }, { width: 16 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  let r = 1;
  const COLS = 9; // total columns

  // Helper: merge A–I and apply masthead
  function sectionHeader(title: string, eyebrow?: string, bg = C.slate900) {
    ws.mergeCells(r, 1, r, COLS);
    const cell = ws.getCell(r, 1);
    cell.value = eyebrow ? `${eyebrow.toUpperCase()}  ·  ${title.toUpperCase()}` : title.toUpperCase();
    cell.fill  = solidFill(bg);
    cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    ws.getRow(r).height = 24;
    r++;
  }

  function subHeader(title: string, colSpan = COLS) {
    ws.mergeCells(r, 1, r, colSpan);
    const cell = ws.getCell(r, 1);
    cell.value = title.toUpperCase();
    cell.fill  = solidFill(C.slate800);
    cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = left;
    ws.getRow(r).height = 18;
    r++;
  }

  function spacer(rows = 1) { r += rows; }

  // ── Document title ──────────────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, COLS);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `LAPORAN AKHIR PROGRAM — ${d.eventName.toUpperCase()}`;
  titleCell.fill  = solidFill(C.slate900);
  titleCell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  titleCell.alignment = center;
  ws.getRow(r).height = 28;
  r++;
  spacer();

  // ═══ RINGKASAN KESELURUHAN ═════════════════════════════════════════════════
  sectionHeader(`Ringkasan Keseluruhan — Penyertaan dan Penglibatan — ${d.locationLabel}`, undefined, C.maroon);

  ws.mergeCells(r, 1, r, COLS - 1);
  applyHeader(ws.getCell(r, 1), "Kategori Penyertaan / Penglibatan", C.slate700);
  applyHeader(ws.getCell(r, COLS), "Jumlah", C.slate700);
  ws.getRow(r).height = 18; r++;

  const overallRows: [string, number | string, string][] = [
    ["1. Peserta Utama",    nv(pesertaUtama),           C.white],
    ["2. Peserta Walk-in",  nv(d.walkInSummary.total),  C.slate50],
    ["3. Jurulatih",        nv(d.trainerCount),         C.white],
  ];
  for (const [label, value, bg] of overallRows) {
    ws.mergeCells(r, 1, r, COLS - 1);
    applyCell(ws.getCell(r, 1), label, bg, left);
    applyCell(ws.getCell(r, COLS), value, bg, right, true);
    ws.getRow(r).height = 16; r++;
  }
  ws.mergeCells(r, 1, r, COLS - 1);
  applyCell(ws.getCell(r, 1), "JUMLAH KESELURUHAN PENYERTAAN DAN PENGLIBATAN", C.slate900, left, true, C.white);
  applyCell(ws.getCell(r, COLS), grandTotal, C.slate900, right, true, C.white);
  ws.getRow(r).height = 20; r++;
  spacer();

  // ═══ SECTION 1: RINGKASAN ══════════════════════════════════════════════════
  sectionHeader("Ringkasan Penyertaan", "Seksyen 1");
  subHeader("Berdaftar", 4);

  // sub-col headers
  applyHeader(ws.getCell(r, 1), "Kategori", C.slate700);
  applyHeader(ws.getCell(r, 2), "Pelajar",  C.slate700);
  applyHeader(ws.getCell(r, 3), "Belia",    C.slate700);
  applyHeader(ws.getCell(r, 4), "Jumlah",   C.slate700);
  ws.getRow(r).height = 18; r++;

  const regRows: [string, number | string, number | string, number | string, string][] = [
    ["Kontinjen Sekolah / Belia",
      nv(d.regSummary.schoolContingents), nv(d.regSummary.beliaContingents),
      nv(d.regSummary.schoolContingents + d.regSummary.beliaContingents), C.slate100],
    ["  ↳ Sekolah Rendah",  nv(d.regSummary.rendahContingents),   "—", nv(d.regSummary.rendahContingents),   C.indigo50],
    ["  ↳ Sekolah Menengah",nv(d.regSummary.menengahContingents), "—", nv(d.regSummary.menengahContingents), C.amber50],
    ["  ↳ Belia",           "—", nv(d.regSummary.beliaContingents),    nv(d.regSummary.beliaContingents),    C.teal50],
    ["Jumlah Pasukan",      nv(d.regSummary.schoolTeams), nv(d.regSummary.beliaTeams),
      nv(d.regSummary.schoolTeams + d.regSummary.beliaTeams), C.white],
    ["Jumlah Peserta (Berdaftar)", nv(d.regSummary.schoolParticipants), nv(d.regSummary.beliaParticipants),
      nv(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants), C.slate50],
  ];
  for (const [label, a, b, tot, bg] of regRows) {
    applyCell(ws.getCell(r, 1), label, bg, left, label === "Kontinjen Sekolah / Belia");
    applyCell(ws.getCell(r, 2), a,     bg, center);
    applyCell(ws.getCell(r, 3), b,     bg, center);
    applyCell(ws.getCell(r, 4), tot,   bg, center, label.startsWith("Jumlah"));
    r++;
  }

  // Berdaftar subtotal banner
  ws.mergeCells(r, 1, r, 3);
  applyCell(ws.getCell(r, 1), "JUMLAH KESELURUHAN PESERTA BERDAFTAR", C.slate800, left, true, C.white);
  applyCell(ws.getCell(r, 4), jumlahPeserta - d.walkInSummary.total, C.slate800, right, true, C.white);
  ws.getRow(r).height = 18; r++;
  spacer();
  spacer();
  subHeader("Walk-In", 4);
  applyHeader(ws.getCell(r, 1), "Kategori", C.slate700);
  applyHeader(ws.getCell(r, 2), "Pelajar",  C.slate700);
  applyHeader(ws.getCell(r, 3), "Belia",    C.slate700);
  applyHeader(ws.getCell(r, 4), "Jumlah",   C.slate700);
  ws.getRow(r).height = 18; r++;
  applyCell(ws.getCell(r, 1), "Jumlah Peserta (Walk-In)", C.white, left);
  applyCell(ws.getCell(r, 2), nv(d.walkInSummary.schoolParticipants), C.white, center);
  applyCell(ws.getCell(r, 3), nv(d.walkInSummary.beliaParticipants),  C.white, center);
  applyCell(ws.getCell(r, 4), nv(d.walkInSummary.total), C.white, center, true);
  r++;

  spacer();
  // Grand total banner
  ws.mergeCells(r, 1, r, 3);
  applyCell(ws.getCell(r, 1), "JUMLAH KESELURUHAN PESERTA (Berdaftar + Walk-In)", C.slate900, left, true, C.white);
  applyCell(ws.getCell(r, 4), jumlahPeserta, C.slate900, center, true, C.white);
  ws.getRow(r).height = 20; r++;

  // Gender
  spacer();
  for (const [label, male, female, maleT, femaleT] of [
    ["Jantina Pelajar Sekolah", d.schoolMale, d.schoolFemale, d.schoolMale + d.schoolFemale, d.schoolMale + d.schoolFemale],
    ["Jantina Belia",           d.beliaMale,  d.beliaFemale,  d.beliaMale + d.beliaFemale,   d.beliaMale + d.beliaFemale],
  ] as [string, number, number, number, number][]) {
    subHeader(label, 4);
    applyHeader(ws.getCell(r, 1), "Jantina",  C.slate700);
    applyHeader(ws.getCell(r, 2), "Bilangan", C.slate700);
    applyHeader(ws.getCell(r, 3), "%",        C.slate700);
    ws.getRow(r).height = 16; r++;
    applyCell(ws.getCell(r, 1), "Lelaki",    C.indigo50, left, true, C.indigo800);
    applyCell(ws.getCell(r, 2), nv(male),    C.indigo50, center, true, C.indigo800);
    applyCell(ws.getCell(r, 3), pct(male, maleT), C.indigo50, center, false, C.indigo800);
    r++;
    applyCell(ws.getCell(r, 1), "Perempuan", C.rose50, left, true, "9F1239");
    applyCell(ws.getCell(r, 2), nv(female),  C.rose50, center, true, "9F1239");
    applyCell(ws.getCell(r, 3), pct(female, femaleT), C.rose50, center, false, "9F1239");
    r++;
    spacer();
  }

  // Walk-in gender
  if (d.walkInSummary.total > 0) {
    for (const [label, male, female] of [
      ["Jantina Pelajar Sekolah (Walk-In)", d.walkInSchoolMale, d.walkInSchoolFemale],
      ["Jantina Belia (Walk-In)",           d.walkInBeliaMale,  d.walkInBeliaFemale],
    ] as [string, number, number][]) {
      const wiGT = male + female;
      subHeader(label, 4);
      applyHeader(ws.getCell(r, 1), "Jantina",  C.slate700);
      applyHeader(ws.getCell(r, 2), "Bilangan", C.slate700);
      applyHeader(ws.getCell(r, 3), "%",        C.slate700);
      ws.getRow(r).height = 16; r++;
      applyCell(ws.getCell(r, 1), "Lelaki",    C.indigo50, left, true, C.indigo800);
      applyCell(ws.getCell(r, 2), nv(male),    C.indigo50, center, true, C.indigo800);
      applyCell(ws.getCell(r, 3), pct(male, wiGT), C.indigo50, center, false, C.indigo800);
      r++;
      applyCell(ws.getCell(r, 1), "Perempuan", C.rose50, left, true, "9F1239");
      applyCell(ws.getCell(r, 2), nv(female),  C.rose50, center, true, "9F1239");
      applyCell(ws.getCell(r, 3), pct(female, wiGT), C.rose50, center, false, "9F1239");
      r++;
      spacer();
    }
  }

  // ═══ SECTION 2: KAUM ═══════════════════════════════════════════════════════
  sectionHeader("Jumlah Peserta Mengikut Kaum", "Seksyen 2 — Bagi Laporan KBS / Rakan Muda");
  const ethnLabels = ["Melayu", "Cina", "India", "Org. Asli", "Sabah", "Sarawak", "Lain-Lain"];
  const regEthnVals = [d.ethnicityStats.melayu, d.ethnicityStats.cina, d.ethnicityStats.india,
    d.ethnicityStats.orgAsli, d.ethnicityStats.sabah, d.ethnicityStats.sarawak, d.ethnicityStats.lainLain];
  const wiEthnVals  = [d.walkInEthnicityStats.melayu, d.walkInEthnicityStats.cina, d.walkInEthnicityStats.india,
    d.walkInEthnicityStats.orgAsli, d.walkInEthnicityStats.sabah, d.walkInEthnicityStats.sarawak, d.walkInEthnicityStats.lainLain];
  const regEthnTotal = regEthnVals.reduce((s, v) => s + v, 0);
  const wiEthnTotal  = wiEthnVals.reduce((s, v) => s + v, 0);
  const ethnGrandTotal = regEthnTotal + wiEthnTotal;
  const ECOLS = ethnLabels.length;

  // column headers
  ethnLabels.forEach((l, i) => applyHeader(ws.getCell(r, i + 1), l));
  ws.getRow(r).height = 18; r++;

  // Berdaftar group
  ws.mergeCells(r, 1, r, ECOLS);
  applyCell(ws.getCell(r, 1), "Peserta Berdaftar", C.slate800, left, true, C.white);
  ws.getRow(r).height = 16; r++;
  regEthnVals.forEach((v, i) => applyCell(ws.getCell(r, i + 1), nv(v), C.white, center, true));
  r++;
  regEthnVals.forEach((v, i) => applyCell(ws.getCell(r, i + 1), pct(v, regEthnTotal), C.slate50, center, false, C.slate400));
  r++;
  ws.mergeCells(r, 1, r, ECOLS);
  applyCell(ws.getCell(r, 1), `Jumlah Berdaftar: ${regEthnTotal}`, C.slate200, right, true);
  r++;

  // Walk-In group (only if present)
  if (wiEthnTotal > 0) {
    ws.mergeCells(r, 1, r, ECOLS);
    applyCell(ws.getCell(r, 1), "Peserta Walk-In", C.slate800, left, true, C.white);
    ws.getRow(r).height = 16; r++;
    wiEthnVals.forEach((v, i) => applyCell(ws.getCell(r, i + 1), nv(v), C.white, center, true));
    r++;
    wiEthnVals.forEach((v, i) => applyCell(ws.getCell(r, i + 1), pct(v, wiEthnTotal), C.slate50, center, false, C.slate400));
    r++;
    ws.mergeCells(r, 1, r, ECOLS);
    applyCell(ws.getCell(r, 1), `Jumlah Walk-In: ${wiEthnTotal}`, C.slate200, right, true);
    r++;
  }

  ws.mergeCells(r, 1, r, ECOLS);
  applyCell(ws.getCell(r, 1), `Jumlah Keseluruhan: ${ethnGrandTotal}`, C.slate900, right, true, C.white);
  r++;
  spacer();

  // ═══ SECTION 3: STATE DETAIL ════════════════════════════════════════════════
  sectionHeader("Laporan Terperinci Mengikut Negeri", "Seksyen 3");
  const stateHdrs = ["Negeri", "Kont. Sekolah", "Sek. Rendah", "Sek. Menengah", "Kont. Belia", "Pasukan", "Peserta", "Lelaki", "Perempuan"];
  stateHdrs.forEach((h, i) => applyHeader(ws.getCell(r, i + 1), h));
  ws.getRow(r).height = 18; r++;
  d.stateStats.forEach((s, i) => {
    const bg = i % 2 === 0 ? C.white : C.slate50;
    applyCell(ws.getCell(r, 1), s.stateName,     C.slate700, left, true, C.white);
    applyCell(ws.getCell(r, 2), nv(s.schoolC),   bg, center, true);
    applyCell(ws.getCell(r, 3), nv(s.rendahC),   bg, center);
    applyCell(ws.getCell(r, 4), nv(s.menengahC), bg, center);
    applyCell(ws.getCell(r, 5), nv(s.beliaC),    bg, center);
    applyCell(ws.getCell(r, 6), nv(s.totalTeams),  bg, center, true);
    applyCell(ws.getCell(r, 7), nv(s.participants),bg, center, true);
    applyCell(ws.getCell(r, 8), nv(s.male),      bg, center);
    applyCell(ws.getCell(r, 9), nv(s.female),    bg, center);
    r++;
  });
  const tot = d.stateStats.reduce((acc, s) => ({
    schoolC: acc.schoolC + s.schoolC, rendahC: acc.rendahC + s.rendahC,
    menengahC: acc.menengahC + s.menengahC, beliaC: acc.beliaC + s.beliaC,
    totalTeams: acc.totalTeams + s.totalTeams, participants: acc.participants + s.participants,
    male: acc.male + s.male, female: acc.female + s.female,
  }), { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 });
  [["JUMLAH", C.white], [tot.schoolC, C.white], [tot.rendahC, C.white], [tot.menengahC, C.white],
   [tot.beliaC, C.white], [tot.totalTeams, C.white], [tot.participants, C.white], [tot.male, C.white], [tot.female, C.white]]
    .forEach(([v, _], i) => applyCell(ws.getCell(r, i + 1), typeof v === "number" ? nv(v) : v, C.slate900, i === 0 ? left : center, true, C.white));
  ws.getRow(r).height = 18; r++;
  spacer();

  // ═══ SECTION 4: BY EDUCATION LEVEL ═════════════════════════════════════════
  sectionHeader("Penyertaan Mengikut Tahap Pendidikan", "Seksyen 4");
  ["Tahap Pendidikan", "Kod", "Pertandingan", "Pasukan", "Peserta"].forEach((h, i) => applyHeader(ws.getCell(r, i + 1), h));
  ws.getRow(r).height = 18; r++;
  const levelGroups = [
    { label: "Sekolah Rendah",   comps: d.rendahComps,   hBg: C.indigo800, rBg: C.indigo50, tBg: C.indigo100 },
    { label: "Sekolah Menengah", comps: d.menengahComps, hBg: C.amber800,  rBg: C.amber50,  tBg: C.amber100 },
    { label: "Belia",            comps: d.beliaComps,    hBg: C.teal800,   rBg: C.teal50,   tBg: C.teal100 },
  ];
  for (const g of levelGroups) {
    if (!g.comps.length) continue;
    ws.mergeCells(r, 1, r, 5);
    applyCell(ws.getCell(r, 1), g.label, g.hBg, left, true, C.white);
    ws.getRow(r).height = 16; r++;
    g.comps.forEach((c, i) => {
      const bg = i % 2 === 0 ? g.rBg : C.white;
      applyCell(ws.getCell(r, 1), "", bg);
      applyCell(ws.getCell(r, 2), c.code, bg, center);
      applyCell(ws.getCell(r, 3), c.name, bg, left);
      applyCell(ws.getCell(r, 4), nv(c.teams), bg, center);
      applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
      r++;
    });
    const subT = g.comps.reduce((s, c) => s + c.teams, 0);
    const subP = g.comps.reduce((s, c) => s + c.participants, 0);
    applyCell(ws.getCell(r, 1), "", g.tBg);
    applyCell(ws.getCell(r, 2), "", g.tBg);
    applyCell(ws.getCell(r, 3), `Jumlah ${g.label}`, g.tBg, right, true);
    applyCell(ws.getCell(r, 4), nv(subT), g.tBg, center, true);
    applyCell(ws.getCell(r, 5), nv(subP), g.tBg, center, true);
    r++; spacer();
  }

  // ═══ SECTION 4b: WALK-IN BY EDUCATION LEVEL ════════════════════════════════
  const hasWalkInComps = d.walkInRendahComps.length > 0 || d.walkInMenengahComps.length > 0 || d.walkInBeliaComps.length > 0;
  if (hasWalkInComps) {
    sectionHeader("Penyertaan Pertandingan Walk-In Mengikut Tahap Pendidikan", "Walk-In");
    ["Tahap Pendidikan", "Kod", "Pertandingan", "—", "Peserta"].forEach((h, i) => applyHeader(ws.getCell(r, i + 1), h));
    ws.getRow(r).height = 18; r++;
    const wiLevelGroups = [
      { label: "Sekolah Rendah",   comps: d.walkInRendahComps,   hBg: C.indigo800, rBg: C.indigo50, tBg: C.indigo100 },
      { label: "Sekolah Menengah", comps: d.walkInMenengahComps, hBg: C.amber800,  rBg: C.amber50,  tBg: C.amber100 },
      { label: "Belia",            comps: d.walkInBeliaComps,    hBg: C.teal800,   rBg: C.teal50,   tBg: C.teal100 },
    ];
    for (const g of wiLevelGroups) {
      if (!g.comps.length) continue;
      ws.mergeCells(r, 1, r, 5);
      applyCell(ws.getCell(r, 1), g.label, g.hBg, left, true, C.white);
      ws.getRow(r).height = 16; r++;
      g.comps.forEach((c, i) => {
        const bg = i % 2 === 0 ? g.rBg : C.white;
        applyCell(ws.getCell(r, 1), "", bg);
        applyCell(ws.getCell(r, 2), c.code, bg, center);
        applyCell(ws.getCell(r, 3), c.name, bg, left);
        applyCell(ws.getCell(r, 4), "—", bg, center);
        applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
        r++;
      });
      const subP = g.comps.reduce((s, c) => s + c.participants, 0);
      applyCell(ws.getCell(r, 1), "", g.tBg);
      applyCell(ws.getCell(r, 2), "", g.tBg);
      applyCell(ws.getCell(r, 3), `Jumlah ${g.label}`, g.tBg, right, true);
      applyCell(ws.getCell(r, 4), "", g.tBg);
      applyCell(ws.getCell(r, 5), nv(subP), g.tBg, center, true);
      r++; spacer();
    }
    const wiTotal2 = [d.walkInRendahComps, d.walkInMenengahComps, d.walkInBeliaComps]
      .flat().reduce((s, c) => s + c.participants, 0);
    ws.mergeCells(r, 1, r, 4);
    applyCell(ws.getCell(r, 1), "JUMLAH KESELURUHAN PESERTA WALK-IN", C.slate900, left, true, C.white);
    applyCell(ws.getCell(r, 5), nv(wiTotal2), C.slate900, center, true, C.white);
    ws.getRow(r).height = 18; r++;
    spacer();
  }

  // ═══ SECTION 5: BY STATE × COMPETITION ══════════════════════════════════════
  sectionHeader("Penyertaan Mengikut Negeri", "Seksyen 5");
  ["Negeri", "Kod", "Pertandingan", "Pasukan", "Peserta"].forEach((h, i) => applyHeader(ws.getCell(r, i + 1), h));
  ws.getRow(r).height = 18; r++;
  d.stateCompStats.forEach((sg, si) => {
    const rowBg = si % 2 === 0 ? C.white : C.slate50;
    ws.mergeCells(r, 1, r, 5);
    applyCell(ws.getCell(r, 1), sg.stateName, C.slate700, left, true, C.white);
    ws.getRow(r).height = 16; r++;
    sg.comps.forEach((c, i) => {
      const bg = i % 2 === 0 ? rowBg : C.white;
      applyCell(ws.getCell(r, 1), "", bg);
      applyCell(ws.getCell(r, 2), c.code, bg, center);
      applyCell(ws.getCell(r, 3), c.name, bg, left);
      applyCell(ws.getCell(r, 4), nv(c.teams), bg, center);
      applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
      r++;
    });
    const subT = sg.comps.reduce((s, c) => s + c.teams, 0);
    const subP = sg.comps.reduce((s, c) => s + c.participants, 0);
    applyCell(ws.getCell(r, 1), "", C.slate200);
    applyCell(ws.getCell(r, 2), "", C.slate200);
    applyCell(ws.getCell(r, 3), `Jumlah ${sg.stateName}`, C.slate200, right, true);
    applyCell(ws.getCell(r, 4), nv(subT), C.slate200, center, true);
    applyCell(ws.getCell(r, 5), nv(subP), C.slate200, center, true);
    r++;
  });
}

// ─── Multi-sheet builder (existing logic, updated palette) ────────────────────
function buildMultiSheet(wb: ExcelJS.Workbook, d: FinalProgramData) {
  const pesertaUtama  = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants;
  const jumlahPeserta = pesertaUtama + d.walkInSummary.total;
  const grandTotal    = jumlahPeserta + d.trainerCount;
  const nv = (v: number) => v === 0 ? "" : v;
  const pct = (n: number, total: number) => total ? +(n / total * 100).toFixed(1) : "";

  // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Ringkasan");
    ws.columns = [
      { width: 36 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 2  },
      { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    ];

    ws.mergeCells("A1:D1");
    applyMasthead(ws.getCell("A1"), `Ringkasan Penyertaan — ${d.locationLabel}`);
    ws.getRow(1).height = 22;

    // Ethnicity title (right side)
    ws.mergeCells("F1:L1");
    applyMasthead(ws.getCell("F1"), "Bagi Laporan KBS — Rakan Muda", C.slate800);

    ws.mergeCells("A2:D2");
    applyMasthead(ws.getCell("A2"), "Berdaftar", C.slate800);
    ws.getRow(2).height = 18;

    applyHeader(ws.getCell("B3"), "Pelajar");
    applyHeader(ws.getCell("C3"), "Belia");
    applyHeader(ws.getCell("D3"), "Jumlah");

    // Kaum header (right side, row 2–3)
    ws.mergeCells("F2:L2");
    applyMasthead(ws.getCell("F2"), "Jumlah Peserta Mengikut Kaum", C.slate700);
    const ethnCols2 = ["F","G","H","I","J","K","L"];
    const ethnLabels2 = ["Melayu","Cina","India","Org. Asli","Sabah","Sarawak","Lain-Lain"];
    ethnCols2.forEach((col, i) => applyHeader(ws.getCell(`${col}3`), ethnLabels2[i]));

    // Kaum — Peserta Berdaftar group (rows 4–7)
    ws.mergeCells("F4:L4");
    applyCell(ws.getCell("F4"), "Peserta Berdaftar", C.slate800, left, true, C.white);
    const regEthnVals2 = [d.ethnicityStats.melayu, d.ethnicityStats.cina, d.ethnicityStats.india,
      d.ethnicityStats.orgAsli, d.ethnicityStats.sabah, d.ethnicityStats.sarawak, d.ethnicityStats.lainLain];
    const regEthnTotal2 = regEthnVals2.reduce((s, v) => s + v, 0);
    ethnCols2.forEach((col, i) => applyCell(ws.getCell(`${col}5`), nv(regEthnVals2[i]), C.white, center, true));
    ethnCols2.forEach((col, i) => applyCell(ws.getCell(`${col}6`), pct(regEthnVals2[i], regEthnTotal2), C.slate50, center, false, C.slate400));
    ws.mergeCells("F7:L7");
    applyCell(ws.getCell("F7"), `Jumlah Berdaftar: ${regEthnTotal2}`, C.slate200, right, true);
    ws.getRow(5).height = 18;

    // Kaum — Peserta Walk-In group (rows 8–11) + grand total (row 12)
    const wiEthnVals2 = [d.walkInEthnicityStats.melayu, d.walkInEthnicityStats.cina, d.walkInEthnicityStats.india,
      d.walkInEthnicityStats.orgAsli, d.walkInEthnicityStats.sabah, d.walkInEthnicityStats.sarawak, d.walkInEthnicityStats.lainLain];
    const wiEthnTotal2 = wiEthnVals2.reduce((s, v) => s + v, 0);
    if (wiEthnTotal2 > 0) {
      ws.mergeCells("F8:L8");
      applyCell(ws.getCell("F8"), "Peserta Walk-In", C.slate800, left, true, C.white);
      ethnCols2.forEach((col, i) => applyCell(ws.getCell(`${col}9`), nv(wiEthnVals2[i]), C.white, center, true));
      ethnCols2.forEach((col, i) => applyCell(ws.getCell(`${col}10`), pct(wiEthnVals2[i], wiEthnTotal2), C.slate50, center, false, C.slate400));
      ws.mergeCells("F11:L11");
      applyCell(ws.getCell("F11"), `Jumlah Walk-In: ${wiEthnTotal2}`, C.slate200, right, true);
      ws.mergeCells("F12:L12");
      applyCell(ws.getCell("F12"), `Jumlah Keseluruhan: ${regEthnTotal2 + wiEthnTotal2}`, C.slate900, right, true, C.white);
    } else {
      ws.mergeCells("F8:L8");
      applyCell(ws.getCell("F8"), `Jumlah Keseluruhan: ${regEthnTotal2}`, C.slate900, right, true, C.white);
    }

    // Berdaftar data (A-D)
    const bRows: [string, string|number, string|number, string|number, string, boolean][] = [
      ["Kontinjen Sekolah / Belia", nv(d.regSummary.schoolContingents), nv(d.regSummary.beliaContingents), nv(d.regSummary.schoolContingents + d.regSummary.beliaContingents), C.slate100, true],
      ["  ↳ Sekolah Rendah",  nv(d.regSummary.rendahContingents),   "—", nv(d.regSummary.rendahContingents),   C.indigo50, false],
      ["  ↳ Sekolah Menengah",nv(d.regSummary.menengahContingents), "—", nv(d.regSummary.menengahContingents), C.amber50, false],
      ["  ↳ Belia",           "—", nv(d.regSummary.beliaContingents), nv(d.regSummary.beliaContingents),       C.teal50, false],
      ["Jumlah Pasukan",      nv(d.regSummary.schoolTeams), nv(d.regSummary.beliaTeams), nv(d.regSummary.schoolTeams + d.regSummary.beliaTeams), C.white, true],
      ["Jumlah Peserta (Berdaftar)", nv(d.regSummary.schoolParticipants), nv(d.regSummary.beliaParticipants), nv(d.regSummary.schoolParticipants + d.regSummary.beliaParticipants), C.slate50, true],
    ];
    bRows.forEach(([label, a, b, tot, bg, bold], i) => {
      const row = i + 4;
      applyCell(ws.getCell(`A${row}`), label, bg, left, bold);
      applyCell(ws.getCell(`B${row}`), a,     bg, center, bold);
      applyCell(ws.getCell(`C${row}`), b,     bg, center);
      applyCell(ws.getCell(`D${row}`), tot,   bg, center, bold);
    });

    // Walk-in
    ws.mergeCells("A11:D11");
    applyMasthead(ws.getCell("A11"), "Walk-In", C.slate800);
    ws.getRow(11).height = 18;
    applyHeader(ws.getCell("B12"), "Pelajar");
    applyHeader(ws.getCell("C12"), "Belia");
    applyHeader(ws.getCell("D12"), "Jumlah");
    applyCell(ws.getCell("A13"), "Jumlah Peserta (Walk-In)", C.white, left);
    applyCell(ws.getCell("B13"), nv(d.walkInSummary.schoolParticipants), C.white, center);
    applyCell(ws.getCell("C13"), nv(d.walkInSummary.beliaParticipants),  C.white, center);
    applyCell(ws.getCell("D13"), nv(d.walkInSummary.total), C.white, center, true);

    ws.mergeCells("A14:C14");
    applyCell(ws.getCell("A14"), "JUMLAH KESELURUHAN PESERTA BERDAFTAR", C.slate800, left, true, C.white);
    applyCell(ws.getCell("D14"), jumlahPeserta - d.walkInSummary.total, C.slate800, center, true, C.white);
    ws.getRow(14).height = 18;
    // Grand total (peserta only, no trainers)
    ws.mergeCells("A15:C15");
    applyCell(ws.getCell("A15"), "JUMLAH KESELURUHAN (Berdaftar + Walk-In)", C.slate900, left, true, C.white);
    applyCell(ws.getCell("D15"), jumlahPeserta, C.slate900, center, true, C.white);
    ws.getRow(15).height = 20;

    // Gender — school
    ws.mergeCells("A17:D17");
    applyMasthead(ws.getCell("A17"), "Jantina Pelajar Sekolah (Rendah & Menengah)", C.slate800);
    ws.getRow(17).height = 18;
    applyHeader(ws.getCell("B18"), "Bilangan"); applyHeader(ws.getCell("C18"), "%");
    applyCell(ws.getCell("A19"), "Lelaki",    C.indigo50, left, true, C.indigo800);
    applyCell(ws.getCell("B19"), nv(d.schoolMale), C.indigo50, center, true, C.indigo800);
    applyCell(ws.getCell("C19"), pct(d.schoolMale, d.schoolMale + d.schoolFemale), C.indigo50, center, false, C.indigo800);
    applyCell(ws.getCell("A20"), "Perempuan", C.rose50, left, true, "9F1239");
    applyCell(ws.getCell("B20"), nv(d.schoolFemale), C.rose50, center, true, "9F1239");
    applyCell(ws.getCell("C20"), pct(d.schoolFemale, d.schoolMale + d.schoolFemale), C.rose50, center, false, "9F1239");

    // Gender — belia
    ws.mergeCells("A22:D22");
    applyMasthead(ws.getCell("A22"), "Jantina Belia", C.slate800);
    ws.getRow(22).height = 18;
    applyHeader(ws.getCell("B23"), "Bilangan"); applyHeader(ws.getCell("C23"), "%");
    applyCell(ws.getCell("A24"), "Lelaki",    C.indigo50, left, true, C.indigo800);
    applyCell(ws.getCell("B24"), nv(d.beliaMale), C.indigo50, center, true, C.indigo800);
    applyCell(ws.getCell("C24"), pct(d.beliaMale, d.beliaMale + d.beliaFemale), C.indigo50, center, false, C.indigo800);
    applyCell(ws.getCell("A25"), "Perempuan", C.rose50, left, true, "9F1239");
    applyCell(ws.getCell("B25"), nv(d.beliaFemale), C.rose50, center, true, "9F1239");
    applyCell(ws.getCell("C25"), pct(d.beliaFemale, d.beliaMale + d.beliaFemale), C.rose50, center, false, "9F1239");

    // Gender — walk-in school
    ws.mergeCells("A27:D27");
    applyMasthead(ws.getCell("A27"), "Jantina Pelajar Sekolah (Walk-In)", C.slate800);
    ws.getRow(27).height = 18;
    applyHeader(ws.getCell("B28"), "Bilangan"); applyHeader(ws.getCell("C28"), "%");
    applyCell(ws.getCell("A29"), "Lelaki",    C.indigo50, left, true, C.indigo800);
    applyCell(ws.getCell("B29"), nv(d.walkInSchoolMale), C.indigo50, center, true, C.indigo800);
    applyCell(ws.getCell("C29"), pct(d.walkInSchoolMale, d.walkInSchoolMale + d.walkInSchoolFemale), C.indigo50, center, false, C.indigo800);
    applyCell(ws.getCell("A30"), "Perempuan", C.rose50, left, true, "9F1239");
    applyCell(ws.getCell("B30"), nv(d.walkInSchoolFemale), C.rose50, center, true, "9F1239");
    applyCell(ws.getCell("C30"), pct(d.walkInSchoolFemale, d.walkInSchoolMale + d.walkInSchoolFemale), C.rose50, center, false, "9F1239");

    // Gender — walk-in belia
    ws.mergeCells("A32:D32");
    applyMasthead(ws.getCell("A32"), "Jantina Belia (Walk-In)", C.slate800);
    ws.getRow(32).height = 18;
    applyHeader(ws.getCell("B33"), "Bilangan"); applyHeader(ws.getCell("C33"), "%");
    applyCell(ws.getCell("A34"), "Lelaki",    C.indigo50, left, true, C.indigo800);
    applyCell(ws.getCell("B34"), nv(d.walkInBeliaMale), C.indigo50, center, true, C.indigo800);
    applyCell(ws.getCell("C34"), pct(d.walkInBeliaMale, d.walkInBeliaMale + d.walkInBeliaFemale), C.indigo50, center, false, C.indigo800);
    applyCell(ws.getCell("A35"), "Perempuan", C.rose50, left, true, "9F1239");
    applyCell(ws.getCell("B35"), nv(d.walkInBeliaFemale), C.rose50, center, true, "9F1239");
    applyCell(ws.getCell("C35"), pct(d.walkInBeliaFemale, d.walkInBeliaMale + d.walkInBeliaFemale), C.rose50, center, false, "9F1239");

    // Ringkasan Keseluruhan block (rows 37–42)
    ws.mergeCells("A37:D37");
    applyMasthead(ws.getCell("A37"), `Ringkasan Keseluruhan — Penyertaan dan Penglibatan — ${d.locationLabel}`, C.maroon);
    ws.getRow(37).height = 22;

    ws.mergeCells("A38:C38");
    applyHeader(ws.getCell("A38"), "Kategori Penyertaan / Penglibatan", C.slate700);
    applyHeader(ws.getCell("D38"), "Jumlah", C.slate700);
    ws.getRow(38).height = 18;

    const mkRows: [string, number | string, string][] = [
      ["1. Peserta Utama",   nv(pesertaUtama),          C.white],
      ["2. Peserta Walk-in", nv(d.walkInSummary.total), C.slate50],
      ["3. Jurulatih",       nv(d.trainerCount),        C.white],
    ];
    mkRows.forEach(([label, val, bg], i) => {
      const row = 39 + i;
      ws.mergeCells(`A${row}:C${row}`);
      applyCell(ws.getCell(`A${row}`), label, bg, left);
      applyCell(ws.getCell(`D${row}`), val,   bg, right, true);
      ws.getRow(row).height = 16;
    });

    ws.mergeCells("A42:C42");
    applyCell(ws.getCell("A42"), "JUMLAH KESELURUHAN PENYERTAAN DAN PENGLIBATAN", C.slate900, left, true, C.white);
    applyCell(ws.getCell("D42"), grandTotal, C.slate900, right, true, C.white);
    ws.getRow(42).height = 20;
  }

  // ── Sheet 2: Terperinci ───────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Laporan Terperinci");
    ws.columns = [
      { width: 28 }, { width: 18 }, { width: 14 }, { width: 16 },
      { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    ];
    ws.mergeCells("A1:I1");
    applyMasthead(ws.getCell("A1"), `Laporan Terperinci — ${d.locationLabel}`);
    ws.getRow(1).height = 22;

    ["Negeri","Kont. Sekolah","Sek. Rendah","Sek. Menengah","Kont. Belia","Pasukan","Peserta","Lelaki","Perempuan"]
      .forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 20;

    d.stateStats.forEach((s, i) => {
      const bg = i % 2 === 0 ? C.white : C.slate50;
      const r = i + 3;
      applyCell(ws.getCell(r, 1), s.stateName,     C.slate700, left, true, C.white);
      applyCell(ws.getCell(r, 2), nv(s.schoolC),   bg, center, true);
      applyCell(ws.getCell(r, 3), nv(s.rendahC),   bg, center);
      applyCell(ws.getCell(r, 4), nv(s.menengahC), bg, center);
      applyCell(ws.getCell(r, 5), nv(s.beliaC),    bg, center);
      applyCell(ws.getCell(r, 6), nv(s.totalTeams),  bg, center, true);
      applyCell(ws.getCell(r, 7), nv(s.participants),bg, center, true);
      applyCell(ws.getCell(r, 8), nv(s.male),      bg, center);
      applyCell(ws.getCell(r, 9), nv(s.female),    bg, center);
    });

    const tr = d.stateStats.length + 3;
    const tot = d.stateStats.reduce((acc, s) => ({
      schoolC: acc.schoolC + s.schoolC, rendahC: acc.rendahC + s.rendahC,
      menengahC: acc.menengahC + s.menengahC, beliaC: acc.beliaC + s.beliaC,
      totalTeams: acc.totalTeams + s.totalTeams, participants: acc.participants + s.participants,
      male: acc.male + s.male, female: acc.female + s.female,
    }), { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 });
    [["JUMLAH"], [nv(tot.schoolC)],[nv(tot.rendahC)],[nv(tot.menengahC)],[nv(tot.beliaC)],
     [nv(tot.totalTeams)],[nv(tot.participants)],[nv(tot.male)],[nv(tot.female)]]
      .forEach(([v], i) => applyCell(ws.getCell(tr, i + 1), v, C.slate900, i === 0 ? left : center, true, C.white));
    ws.getRow(tr).height = 18;
  }

  // ── Sheet 3: Mengikut Tahap ───────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Mengikut Tahap Pendidikan");
    ws.columns = [{ width: 22 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 14 }];
    ws.mergeCells("A1:E1");
    applyMasthead(ws.getCell("A1"), "Penyertaan Mengikut Tahap Pendidikan");
    ws.getRow(1).height = 22;
    ["Tahap Pendidikan","Kod","Pertandingan","Pasukan","Peserta"]
      .forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 18;

    let r = 3;
    const levelGroups = [
      { label: "Sekolah Rendah",   comps: d.rendahComps,   hBg: C.indigo800, rBg: C.indigo50, tBg: C.indigo100 },
      { label: "Sekolah Menengah", comps: d.menengahComps, hBg: C.amber800,  rBg: C.amber50,  tBg: C.amber100 },
      { label: "Belia",            comps: d.beliaComps,    hBg: C.teal800,   rBg: C.teal50,   tBg: C.teal100 },
    ];
    for (const g of levelGroups) {
      if (!g.comps.length) continue;
      ws.mergeCells(r, 1, r, 5);
      applyCell(ws.getCell(r, 1), g.label, g.hBg, left, true, C.white);
      ws.getRow(r).height = 16; r++;
      g.comps.forEach((c, i) => {
        const bg = i % 2 === 0 ? g.rBg : C.white;
        applyCell(ws.getCell(r, 1), "", bg);
        applyCell(ws.getCell(r, 2), c.code, bg, center);
        applyCell(ws.getCell(r, 3), c.name, bg, left);
        applyCell(ws.getCell(r, 4), nv(c.teams), bg, center);
        applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
        r++;
      });
      const subT = g.comps.reduce((s, c) => s + c.teams, 0);
      const subP = g.comps.reduce((s, c) => s + c.participants, 0);
      applyCell(ws.getCell(r, 1), "", g.tBg);
      applyCell(ws.getCell(r, 2), "", g.tBg);
      applyCell(ws.getCell(r, 3), `Jumlah ${g.label}`, g.tBg, right, true);
      applyCell(ws.getCell(r, 4), nv(subT), g.tBg, center, true);
      applyCell(ws.getCell(r, 5), nv(subP), g.tBg, center, true);
      r += 2;
    }

    // Walk-In competitions by level
    const hasWI = d.walkInRendahComps.length > 0 || d.walkInMenengahComps.length > 0 || d.walkInBeliaComps.length > 0;
    if (hasWI) {
      r++;
      ws.mergeCells(r, 1, r, 5);
      applyCell(ws.getCell(r, 1), "Penyertaan Pertandingan Walk-In Mengikut Tahap Pendidikan", C.slate800, left, true, C.white);
      ws.getRow(r).height = 18; r++;
      ["Tahap Pendidikan", "Kod", "Pertandingan", "—", "Peserta"].forEach((h, i) => applyHeader(ws.getCell(r, i + 1), h));
      ws.getRow(r).height = 18; r++;
      const wiLevelGrps = [
        { label: "Sekolah Rendah",   comps: d.walkInRendahComps,   hBg: C.indigo800, rBg: C.indigo50, tBg: C.indigo100 },
        { label: "Sekolah Menengah", comps: d.walkInMenengahComps, hBg: C.amber800,  rBg: C.amber50,  tBg: C.amber100 },
        { label: "Belia",            comps: d.walkInBeliaComps,    hBg: C.teal800,   rBg: C.teal50,   tBg: C.teal100 },
      ];
      for (const g of wiLevelGrps) {
        if (!g.comps.length) continue;
        ws.mergeCells(r, 1, r, 5);
        applyCell(ws.getCell(r, 1), g.label, g.hBg, left, true, C.white);
        ws.getRow(r).height = 16; r++;
        g.comps.forEach((c, i) => {
          const bg = i % 2 === 0 ? g.rBg : C.white;
          applyCell(ws.getCell(r, 1), "", bg);
          applyCell(ws.getCell(r, 2), c.code, bg, center);
          applyCell(ws.getCell(r, 3), c.name, bg, left);
          applyCell(ws.getCell(r, 4), "—", bg, center);
          applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
          r++;
        });
        const subWIP = g.comps.reduce((s, c) => s + c.participants, 0);
        applyCell(ws.getCell(r, 1), "", g.tBg);
        applyCell(ws.getCell(r, 2), "", g.tBg);
        applyCell(ws.getCell(r, 3), `Jumlah ${g.label}`, g.tBg, right, true);
        applyCell(ws.getCell(r, 4), "", g.tBg);
        applyCell(ws.getCell(r, 5), nv(subWIP), g.tBg, center, true);
        r += 2;
      }
    }
  }

  // ── Sheet 4: Mengikut Negeri ──────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Mengikut Negeri");
    ws.columns = [{ width: 26 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 14 }];
    ws.mergeCells("A1:E1");
    applyMasthead(ws.getCell("A1"), "Penyertaan Mengikut Negeri");
    ws.getRow(1).height = 22;
    ["Negeri","Kod","Pertandingan","Pasukan","Peserta"]
      .forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 18;

    let r = 3;
    d.stateCompStats.forEach((sg, si) => {
      const rowBg = si % 2 === 0 ? C.white : C.slate50;
      ws.mergeCells(r, 1, r, 5);
      applyCell(ws.getCell(r, 1), sg.stateName, C.slate700, left, true, C.white);
      ws.getRow(r).height = 16; r++;
      sg.comps.forEach((c, i) => {
        const bg = i % 2 === 0 ? rowBg : C.white;
        applyCell(ws.getCell(r, 1), "", bg);
        applyCell(ws.getCell(r, 2), c.code, bg, center);
        applyCell(ws.getCell(r, 3), c.name, bg, left);
        applyCell(ws.getCell(r, 4), nv(c.teams), bg, center);
        applyCell(ws.getCell(r, 5), nv(c.participants), bg, center);
        r++;
      });
      const subT = sg.comps.reduce((s, c) => s + c.teams, 0);
      const subP = sg.comps.reduce((s, c) => s + c.participants, 0);
      applyCell(ws.getCell(r, 1), "", C.slate200);
      applyCell(ws.getCell(r, 2), "", C.slate200);
      applyCell(ws.getCell(r, 3), `Jumlah ${sg.stateName}`, C.slate200, right, true);
      applyCell(ws.getCell(r, 4), nv(subT), C.slate200, center, true);
      applyCell(ws.getCell(r, 5), nv(subP), C.slate200, center, true);
      r += 2;
    });
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const data = await computeFinalProgramData(eventId);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const mode = new URL(req.url).searchParams.get("mode") ?? "multi";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Techlympics";
  wb.created = new Date();

  if (mode === "single") {
    buildSingleSheet(wb, data);
  } else {
    buildMultiSheet(wb, data);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const modeSuffix = mode === "single" ? "-single" : "";
  const safeName = `Laporan-Akhir-Program-${data.slug}${modeSuffix}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
