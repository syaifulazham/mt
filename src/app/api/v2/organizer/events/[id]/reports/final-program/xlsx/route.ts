import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { computeFinalProgramData } from "@/lib/reports/finalProgramData";
import ExcelJS from "exceljs";

// ─── colour palette ────────────────────────────────────────────────────────────
const C = {
  darkBg:   "1E293B",
  darkText: "FFFFFF",
  blueBg:   "1D4ED8",
  blueText: "FFFFFF",
  lblue:    "DBEAFE",
  green:    "D1FAE5",
  yellow:   "FEF9C3",
  blue:     "DBEAFE",
  grey:     "F1F5F9",
  white:    "FFFFFF",
  orange:   "FED7AA",
  totBg:    "1E3A8A",
  totText:  "FFFFFF",
};

type Fill = ExcelJS.Fill;
type Alignment = Partial<ExcelJS.Alignment>;
type Border = Partial<ExcelJS.Borders>;

const solidFill = (hex: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
const thinBorder: Border = {
  top:    { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  left:   { style: "thin", color: { argb: "FFCBD5E1" } },
  right:  { style: "thin", color: { argb: "FFCBD5E1" } },
};
const center: Alignment = { vertical: "middle", horizontal: "center", wrapText: true };
const left:   Alignment = { vertical: "middle", horizontal: "left",   wrapText: true };
const right:  Alignment = { vertical: "middle", horizontal: "right" };

function applyHeader(cell: ExcelJS.Cell, text: string, bg = C.blueBg) {
  cell.value = text;
  cell.fill  = solidFill(bg);
  cell.font  = { bold: true, color: { argb: "FF" + C.blueText }, size: 10 };
  cell.alignment = center;
  cell.border = thinBorder;
}

function applyCell(cell: ExcelJS.Cell, value: string | number, bg = C.white, align: Alignment = left, bold = false, color = "374151") {
  cell.value = value;
  cell.fill  = solidFill(bg);
  cell.font  = { size: 10, bold, color: { argb: "FF" + color } };
  cell.alignment = align;
  cell.border = thinBorder;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const data = await computeFinalProgramData(eventId);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Techlympics";
  wb.created = new Date();

  const d = data;
  const grandTotal = d.regSummary.schoolParticipants + d.regSummary.beliaParticipants + d.walkInSummary.total;
  const pct = (n: number, total: number) => total ? +(n / total * 100).toFixed(1) : 0;
  const n = (v: number) => v.toLocaleString("ms-MY");

  // ── Sheet 1: Ringkasan ─────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Ringkasan");
    ws.columns = [
      { width: 36 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 2  },
      { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    ];

    // Title
    ws.mergeCells("A1:D1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `RINGKASAN LAPORAN STATISTIK PENYERTAAN — ${d.locationLabel.toUpperCase()}`;
    titleCell.fill  = solidFill(C.darkBg);
    titleCell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    titleCell.alignment = center;
    ws.getRow(1).height = 22;

    // Right side title
    ws.mergeCells("F1:L1");
    const rightTitle = ws.getCell("F1");
    rightTitle.value = "BAGI LAPORAN KE KBS DIBAWAH INISIATIF RAKAN MUDA";
    rightTitle.fill  = solidFill("065F46");
    rightTitle.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    rightTitle.alignment = center;

    // BERDAFTAR header
    ws.mergeCells("A2:D2");
    applyHeader(ws.getCell("A2"), "BERDAFTAR", C.darkBg);
    ws.getRow(2).height = 18;

    // Column sub-headers
    applyHeader(ws.getCell("B3"), "Pelajar");
    applyHeader(ws.getCell("C3"), "Belia");
    applyHeader(ws.getCell("D3"), "Jumlah");

    // Ethnicity sub-headers
    const ethnCols = ["F", "G", "H", "I", "J", "K", "L"];
    const ethnLabels = ["Melayu", "Cina", "India", "Org. Asli", "Lain-Lain", "Sabah", "Sarawak"];
    ws.mergeCells("F2:L2");
    const ethnHead = ws.getCell("F2");
    ethnHead.value = "JUMLAH PESERTA MENGIKUT KAUM";
    ethnHead.fill  = solidFill("047857");
    ethnHead.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    ethnHead.alignment = center;
    ethnCols.forEach((col, i) => applyHeader(ws.getCell(`${col}3`), ethnLabels[i], "047857"));

    // Ethnicity values
    const ethnVals = [d.ethnicityStats.melayu, d.ethnicityStats.cina, d.ethnicityStats.india,
      d.ethnicityStats.orgAsli, d.ethnicityStats.lainLain, d.ethnicityStats.sabah, d.ethnicityStats.sarawak];
    ethnCols.forEach((col, i) => applyCell(ws.getCell(`${col}4`), ethnVals[i], C.green, center, true, "065F46"));
    ws.getRow(4).height = 18;

    // Contingent row
    let r = 4;
    applyCell(ws.getCell(`A${r}`), "Kontinjen Sekolah / Belia", C.grey, left, true);
    applyCell(ws.getCell(`B${r}`), d.regSummary.schoolContingents, C.grey, center, true);
    applyCell(ws.getCell(`C${r}`), d.regSummary.beliaContingents,  C.grey, center, true);
    applyCell(ws.getCell(`D${r}`), d.regSummary.schoolContingents + d.regSummary.beliaContingents, C.grey, center, true);

    r = 5;
    applyCell(ws.getCell(`A${r}`), "  Sekolah Rendah",    C.green, left);
    applyCell(ws.getCell(`B${r}`), d.regSummary.rendahContingents, C.green, center);
    applyCell(ws.getCell(`C${r}`), "—", C.green, center);
    applyCell(ws.getCell(`D${r}`), d.regSummary.rendahContingents, C.green, center);

    r = 6;
    applyCell(ws.getCell(`A${r}`), "  Sekolah Menengah",  C.yellow, left);
    applyCell(ws.getCell(`B${r}`), d.regSummary.menengahContingents, C.yellow, center);
    applyCell(ws.getCell(`C${r}`), "—", C.yellow, center);
    applyCell(ws.getCell(`D${r}`), d.regSummary.menengahContingents, C.yellow, center);

    r = 7;
    applyCell(ws.getCell(`A${r}`), "  Belia",             C.blue, left);
    applyCell(ws.getCell(`B${r}`), "—", C.blue, center);
    applyCell(ws.getCell(`C${r}`), d.regSummary.beliaContingents, C.blue, center);
    applyCell(ws.getCell(`D${r}`), d.regSummary.beliaContingents, C.blue, center);

    r = 8;
    applyCell(ws.getCell(`A${r}`), "Jumlah Pasukan", C.white, left);
    applyCell(ws.getCell(`B${r}`), d.regSummary.schoolTeams, C.white, center);
    applyCell(ws.getCell(`C${r}`), d.regSummary.beliaTeams,  C.white, center);
    applyCell(ws.getCell(`D${r}`), d.regSummary.schoolTeams + d.regSummary.beliaTeams, C.white, center, true);

    r = 9;
    applyCell(ws.getCell(`A${r}`), "Jumlah Peserta (Berdaftar)", C.white, left);
    applyCell(ws.getCell(`B${r}`), d.regSummary.schoolParticipants, C.white, center);
    applyCell(ws.getCell(`C${r}`), d.regSummary.beliaParticipants,  C.white, center);
    applyCell(ws.getCell(`D${r}`), d.regSummary.schoolParticipants + d.regSummary.beliaParticipants, C.white, center, true);

    // WALK-IN
    r = 11;
    ws.mergeCells(`A${r}:D${r}`);
    applyHeader(ws.getCell(`A${r}`), "WALK-IN", C.darkBg);
    ws.getRow(r).height = 18;

    r = 12;
    applyHeader(ws.getCell("B12"), "Pelajar");
    applyHeader(ws.getCell("C12"), "Belia");
    applyHeader(ws.getCell("D12"), "Jumlah");

    r = 13;
    applyCell(ws.getCell(`A${r}`), "Jumlah Peserta (Walk-In)", C.white, left);
    applyCell(ws.getCell(`B${r}`), d.walkInSummary.schoolParticipants || "—", C.white, center);
    applyCell(ws.getCell(`C${r}`), d.walkInSummary.beliaParticipants  || "—", C.white, center);
    applyCell(ws.getCell(`D${r}`), d.walkInSummary.total || "—", C.white, center, true);

    // BERDAFTAR + WALK IN
    r = 15;
    ws.mergeCells(`A${r}:C${r}`);
    applyCell(ws.getCell(`A${r}`), "JUMLAH PESERTA KESELURUHAN (Berdaftar + Walk-In)", C.orange, left, true);
    applyCell(ws.getCell(`D${r}`), grandTotal, C.orange, center, true);
    ws.getRow(r).height = 20;

    // Gender — school
    r = 17;
    ws.mergeCells(`A${r}:D${r}`);
    applyHeader(ws.getCell(`A${r}`), "JANTINA PELAJAR SEKOLAH (RENDAH & MENENGAH)", C.darkBg);
    ws.getRow(r).height = 18;

    r = 18;
    applyHeader(ws.getCell("B18"), "Bilangan"); applyHeader(ws.getCell("C18"), "%");

    r = 19;
    applyCell(ws.getCell(`A${r}`), "Lelaki",    "BFDBFE", left);
    applyCell(ws.getCell(`B${r}`), d.schoolMale,    "BFDBFE", center, true);
    applyCell(ws.getCell(`C${r}`), pct(d.schoolMale, d.schoolMale + d.schoolFemale), "BFDBFE", center);

    r = 20;
    applyCell(ws.getCell(`A${r}`), "Perempuan", "FBCFE8", left);
    applyCell(ws.getCell(`B${r}`), d.schoolFemale,  "FBCFE8", center, true);
    applyCell(ws.getCell(`C${r}`), pct(d.schoolFemale, d.schoolMale + d.schoolFemale), "FBCFE8", center);

    // Gender — belia
    r = 22;
    ws.mergeCells(`A${r}:D${r}`);
    applyHeader(ws.getCell(`A${r}`), "JANTINA BELIA", C.darkBg);
    ws.getRow(r).height = 18;

    r = 23;
    applyHeader(ws.getCell("B23"), "Bilangan"); applyHeader(ws.getCell("C23"), "%");

    r = 24;
    applyCell(ws.getCell(`A${r}`), "Lelaki",    "BFDBFE", left);
    applyCell(ws.getCell(`B${r}`), d.beliaMale,    "BFDBFE", center, true);
    applyCell(ws.getCell(`C${r}`), pct(d.beliaMale, d.beliaMale + d.beliaFemale), "BFDBFE", center);

    r = 25;
    applyCell(ws.getCell(`A${r}`), "Perempuan", "FBCFE8", left);
    applyCell(ws.getCell(`B${r}`), d.beliaFemale,  "FBCFE8", center, true);
    applyCell(ws.getCell(`C${r}`), pct(d.beliaFemale, d.beliaMale + d.beliaFemale), "FBCFE8", center);
  }

  // ── Sheet 2: Terperinci (by state) ────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Laporan Terperinci");
    ws.columns = [
      { width: 28 }, { width: 18 }, { width: 14 }, { width: 16 },
      { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    ];

    ws.mergeCells("A1:I1");
    applyHeader(ws.getCell("A1"), `LAPORAN TERPERINCI STATISTIK PENYERTAAN — ${d.locationLabel.toUpperCase()}`, C.darkBg);
    ws.getRow(1).height = 22;

    const hdrs2 = ["NEGERI", "KONTINJEN SEKOLAH", "SEKOLAH RENDAH", "SEKOLAH MENENGAH",
                   "KONTINJEN BELIA", "PASUKAN", "PESERTA", "LELAKI", "PEREMPUAN"];
    hdrs2.forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 20;

    const STATE_FILLS = ["FED7AA", "FEF9C3", "D1FAE5", "DBEAFE", "EDE9FE", "FCE7F3", "CCFBF1", "FEE2E2"];
    d.stateStats.forEach((s, i) => {
      const r = i + 3;
      const bg = STATE_FILLS[i % STATE_FILLS.length];
      applyCell(ws.getCell(r, 1), s.stateName,    bg, left, true);
      applyCell(ws.getCell(r, 2), s.schoolC,       bg, center, true);
      applyCell(ws.getCell(r, 3), s.rendahC,       bg, center);
      applyCell(ws.getCell(r, 4), s.menengahC,     bg, center);
      applyCell(ws.getCell(r, 5), s.beliaC,        bg, center);
      applyCell(ws.getCell(r, 6), s.totalTeams,    bg, center, true);
      applyCell(ws.getCell(r, 7), s.participants,  bg, center, true);
      applyCell(ws.getCell(r, 8), s.male,          bg, center);
      applyCell(ws.getCell(r, 9), s.female,        bg, center);
    });

    // Totals
    const tr = d.stateStats.length + 3;
    const tot = d.stateStats.reduce((acc, s) => ({
      schoolC:   acc.schoolC   + s.schoolC,
      rendahC:   acc.rendahC   + s.rendahC,
      menengahC: acc.menengahC + s.menengahC,
      beliaC:    acc.beliaC    + s.beliaC,
      totalTeams: acc.totalTeams + s.totalTeams,
      participants: acc.participants + s.participants,
      male:  acc.male  + s.male,
      female: acc.female + s.female,
    }), { schoolC: 0, rendahC: 0, menengahC: 0, beliaC: 0, totalTeams: 0, participants: 0, male: 0, female: 0 });

    applyCell(ws.getCell(tr, 1), "JUMLAH",       C.totBg, left, true, C.totText);
    applyCell(ws.getCell(tr, 2), tot.schoolC,    C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 3), tot.rendahC,    C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 4), tot.menengahC,  C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 5), tot.beliaC,     C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 6), tot.totalTeams, C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 7), tot.participants, C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 8), tot.male,       C.totBg, center, true, C.totText);
    applyCell(ws.getCell(tr, 9), tot.female,     C.totBg, center, true, C.totText);
    ws.getRow(tr).height = 18;
  }

  // ── Sheet 3: Mengikut Tahap ────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Mengikut Tahap Pendidikan");
    ws.columns = [{ width: 22 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 14 }];

    ws.mergeCells("A1:E1");
    applyHeader(ws.getCell("A1"), "1. PENYERTAAN MENGIKUT TAHAP PENDIDIKAN", C.darkBg);
    ws.getRow(1).height = 22;

    const hdrs3 = ["TAHAP PENDIDIKAN", "KOD", "PERTANDINGAN", "PASUKAN", "PESERTA"];
    hdrs3.forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 18;

    let r = 3;
    const groups = [
      { label: "Sekolah Rendah",    comps: d.rendahComps,   bg: C.green,  totBg: "A7F3D0" },
      { label: "Sekolah Menengah",  comps: d.menengahComps, bg: C.yellow, totBg: "FDE68A" },
      { label: "Belia",             comps: d.beliaComps,    bg: C.blue,   totBg: "BFDBFE" },
    ];
    for (const g of groups) {
      if (!g.comps.length) continue;
      ws.mergeCells(`A${r}:E${r}`);
      applyCell(ws.getCell(`A${r}`), g.label, g.totBg, left, true);
      ws.getRow(r).height = 16;
      r++;
      g.comps.forEach((c, i) => {
        const rowBg = i % 2 === 0 ? C.white : C.grey;
        applyCell(ws.getCell(r, 1), "",       rowBg, left);
        applyCell(ws.getCell(r, 2), c.code,   rowBg, center);
        applyCell(ws.getCell(r, 3), c.name,   rowBg, left);
        applyCell(ws.getCell(r, 4), c.teams,  rowBg, center);
        applyCell(ws.getCell(r, 5), c.participants, rowBg, center);
        r++;
      });
      const subT = g.comps.reduce((s, c) => s + c.teams, 0);
      const subP = g.comps.reduce((s, c) => s + c.participants, 0);
      applyCell(ws.getCell(r, 1), "", g.totBg);
      applyCell(ws.getCell(r, 2), "", g.totBg);
      applyCell(ws.getCell(r, 3), `Jumlah ${g.label}`, g.totBg, right, true);
      applyCell(ws.getCell(r, 4), subT, g.totBg, center, true);
      applyCell(ws.getCell(r, 5), subP, g.totBg, center, true);
      r += 2;
    }
  }

  // ── Sheet 4: Mengikut Negeri × Pertandingan ───────────────────────────────
  {
    const ws = wb.addWorksheet("Mengikut Negeri");
    ws.columns = [{ width: 26 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 14 }];

    ws.mergeCells("A1:E1");
    applyHeader(ws.getCell("A1"), "2. PENYERTAAN MENGIKUT NEGERI", C.darkBg);
    ws.getRow(1).height = 22;

    const hdrs4 = ["NEGERI", "KOD", "PERTANDINGAN", "PASUKAN", "PESERTA"];
    hdrs4.forEach((h, i) => applyHeader(ws.getCell(2, i + 1), h));
    ws.getRow(2).height = 18;

    const STATE_FILLS = ["FED7AA", "FEF9C3", "D1FAE5", "DBEAFE", "EDE9FE", "FCE7F3", "CCFBF1", "FEE2E2"];

    let r = 3;
    d.stateCompStats.forEach((sg, si) => {
      const bg  = STATE_FILLS[si % STATE_FILLS.length];
      ws.mergeCells(`A${r}:E${r}`);
      applyCell(ws.getCell(`A${r}`), sg.stateName, bg, left, true);
      ws.getRow(r).height = 16;
      r++;

      sg.comps.forEach((c, i) => {
        const rowBg = i % 2 === 0 ? C.white : C.grey;
        applyCell(ws.getCell(r, 1), "", rowBg);
        applyCell(ws.getCell(r, 2), c.code, rowBg, center);
        applyCell(ws.getCell(r, 3), c.name, rowBg, left);
        applyCell(ws.getCell(r, 4), c.teams, rowBg, center);
        applyCell(ws.getCell(r, 5), c.participants, rowBg, center);
        r++;
      });

      const subT = sg.comps.reduce((s, c) => s + c.teams, 0);
      const subP = sg.comps.reduce((s, c) => s + c.participants, 0);
      applyCell(ws.getCell(r, 1), "", bg);
      applyCell(ws.getCell(r, 2), "", bg);
      applyCell(ws.getCell(r, 3), `Jumlah ${sg.stateName}`, bg, right, true);
      applyCell(ws.getCell(r, 4), subT, bg, center, true);
      applyCell(ws.getCell(r, 5), subP, bg, center, true);
      r += 2;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = `Laporan-Akhir-Program-${d.slug}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
