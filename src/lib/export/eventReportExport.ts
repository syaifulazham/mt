import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  PageOrientation, convertInchesToTwip,
} from "docx";

// Re-export shared types so the client only needs one import
export type { StatsPayload, StatsSummary, GradeStat, StateStat } from "./preregistrationStatsExport";
import type { StatsPayload } from "./preregistrationStatsExport";

export type CompetitionEntry = {
  id: string; name: string; code: string; schoolLevels: string[];
  teams: number; participants: number;
};

export type CompetitionStateStat = {
  competitionId: string; stateName: string; teams: number; participants: number;
};

const LEVEL_ORDER = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"];
const LEVEL_LABEL: Record<string, string> = {
  KINDERGARTEN: "Tadika",
  PRIMARY:      "Sekolah Rendah",
  SECONDARY:    "Sekolah Menengah",
  YOUTH:        "Belia",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function n(v: number) { return v.toLocaleString("ms-MY"); }

function bar(value: number, max: number, width = 20): string {
  if (max === 0) return "";
  return "█".repeat(Math.max(1, Math.round((value / max) * width)));
}

// ── XLSX export ───────────────────────────────────────────────────────────────

export function exportXlsx(
  eventName: string,
  slug: string,
  s: StatsPayload,
  competitions: CompetitionEntry[],
  competitionStateStats: CompetitionStateStat[],
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
  const pct = (a: number, b: number) => b ? +(a / b * 100).toFixed(1) : 0;
  const summaryAoa = [
    ["LAPORAN STATISTIK PENYERTAAN"],
    [eventName],
    [],
    ["METRIK", "JUMLAH"],
    ["Kontingen Sekolah",  s.summary.schoolContingents],
    ["Sekolah Rendah",     s.summary.primarySchools],
    ["Sekolah Menengah",   s.summary.secondarySchools],
    ["Jumlah Pasukan",     s.summary.teams],
    ["Jumlah Peserta",     s.summary.participants],
    [],
    ["JANTINA", "BILANGAN", "%", "GRAF"],
    ["Lelaki",    s.summary.male,   pct(s.summary.male,   s.summary.participants), bar(s.summary.male,   s.summary.participants)],
    ["Perempuan", s.summary.female, pct(s.summary.female, s.summary.participants), bar(s.summary.female, s.summary.participants)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws1["!cols"]   = [{ wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 22 }];
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

  // ── Sheet 2: Mengikut Negeri ──────────────────────────────────────────────
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
    ...s.byState.map(r => [r.stateName, r.schoolContingents, r.primarySchools, r.secondarySchools, r.teams, r.participants, r.male, r.female]),
    ["JUMLAH", totals.schoolContingents, totals.primarySchools, totals.secondarySchools, totals.teams, totals.participants, totals.male, totals.female],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(stateAoa);
  ws2["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 17 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Mengikut Negeri");

  // ── Sheet 3: Pertandingan Mengikut Tahap Pendidikan ───────────────────────
  const maxTeams = Math.max(...competitions.map(c => c.teams), 1);
  const levelAoa: (string | number)[][] = [
    ["TAHAP PENDIDIKAN", "KOD", "PERTANDINGAN", "PASUKAN", "PESERTA", "GRAF (PASUKAN)"],
  ];
  for (const level of LEVEL_ORDER) {
    const group = competitions
      .filter(c => c.schoolLevels.includes(level))
      .sort((a, b) => a.code.localeCompare(b.code));
    if (!group.length) continue;
    levelAoa.push([LEVEL_LABEL[level] ?? level, "", "", "", "", ""]);
    for (const c of group) {
      levelAoa.push(["", c.code, c.name, c.teams, c.participants, bar(c.teams, maxTeams)]);
    }
    const subTeams = group.reduce((s, c) => s + c.teams, 0);
    const subPart  = group.reduce((s, c) => s + c.participants, 0);
    levelAoa.push(["Jumlah " + (LEVEL_LABEL[level] ?? level), "", "", subTeams, subPart, ""]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(levelAoa);
  ws3["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Pertandingan Mengikut Tahap");

  // ── Sheet 4: Pertandingan Mengikut Negeri ─────────────────────────────────
  const compMap = new Map(competitions.map(c => [c.id, c]));
  const stateCompMap = new Map<string, CompetitionStateStat[]>();
  for (const r of competitionStateStats) {
    const arr = stateCompMap.get(r.stateName) ?? [];
    arr.push(r);
    stateCompMap.set(r.stateName, arr);
  }

  const stateCompAoa: (string | number)[][] = [
    ["NEGERI", "KOD", "PERTANDINGAN", "PASUKAN", "PESERTA"],
  ];
  for (const [stateName, rows] of [...stateCompMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = rows
      .map(r => ({ ...r, comp: compMap.get(r.competitionId) }))
      .filter(r => r.comp)
      .sort((a, b) => a.comp!.code.localeCompare(b.comp!.code));
    stateCompAoa.push([stateName, "", "", "", ""]);
    for (const r of sorted) {
      stateCompAoa.push(["", r.comp!.code, r.comp!.name, r.teams, r.participants]);
    }
    stateCompAoa.push([
      "Jumlah " + stateName, "", "",
      sorted.reduce((s, r) => s + r.teams, 0),
      sorted.reduce((s, r) => s + r.participants, 0),
    ]);
  }
  const ws4 = XLSX.utils.aoa_to_sheet(stateCompAoa);
  ws4["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Pertandingan Mengikut Negeri");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Laporan-Penyertaan-${slug}.xlsx`,
  );
}

// ── DOCX helpers ──────────────────────────────────────────────────────────────

const BLUE  = "1D4ED8";
const LBLUE = "DBEAFE";
const GREY  = "F4F4F5";
const WHITE = "FFFFFF";
const VIOLET = "4C1D95";
const LVIOL = "EDE9FE";
const LGREY = "E5E7EB";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };

function hCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: WHITE, size: 20 })] })],
    shading: { type: ShadingType.CLEAR, fill: BLUE, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
  });
}

function dCell(text: string, shade = WHITE, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT, bold = false, color?: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 20, bold, color: color ?? (shade === WHITE ? "374151" : "1E3A8A") })] })],
    shading: { type: ShadingType.CLEAR, fill: shade, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function groupCell(text: string, span: number, fill: string): TableCell {
  return new TableCell({
    columnSpan: span,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "1E3A8A", size: 20 })] })],
    shading: { type: ShadingType.CLEAR, fill, color: "auto" },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 }, children: [new TextRun({ text, color: "1E3A8A" })] });
}

// ── DOCX export ───────────────────────────────────────────────────────────────

export async function exportDocx(
  eventName: string,
  slug: string,
  s: StatsPayload,
  competitions: CompetitionEntry[],
  competitionStateStats: CompetitionStateStat[],
): Promise<void> {
  const generated = new Date().toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const total = s.summary.participants || 1;
  const malePct = (s.summary.male / total * 100).toFixed(1);
  const femPct  = (s.summary.female / total * 100).toFixed(1);

  // ── 1. Summary table ───────────────────────────────────────────────────────
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
        children: [dCell(row[0], i % 2 === 0 ? WHITE : GREY), dCell(n(row[1]), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT)],
      })),
    ],
  });

  // ── 2. Gender table ────────────────────────────────────────────────────────
  const genderTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [hCell("JANTINA"), hCell("BILANGAN"), hCell("PERATUSAN")] }),
      new TableRow({ children: [dCell("Lelaki"), dCell(n(s.summary.male), WHITE, AlignmentType.RIGHT), dCell(`${malePct}%`, WHITE, AlignmentType.RIGHT)] }),
      new TableRow({ children: [dCell("Perempuan", GREY), dCell(n(s.summary.female), GREY, AlignmentType.RIGHT), dCell(`${femPct}%`, GREY, AlignmentType.RIGHT)] }),
    ],
  });

  // ── 3. By-state table ──────────────────────────────────────────────────────
  const COL_W = convertInchesToTwip(0.85);
  const stateHdrs = ["NEGERI", "KONTINGEN", "RENDAH", "MENENGAH", "PASUKAN", "PESERTA", "LELAKI", "PEREMPUAN"];
  const stateTotals = s.byState.reduce((acc, r) => ({
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
      new TableRow({ children: stateHdrs.map(h => hCell(h, COL_W)) }),
      ...s.byState.map((r, i) => new TableRow({
        children: [
          dCell(r.stateName,             i % 2 === 0 ? WHITE : GREY),
          dCell(n(r.schoolContingents),  i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.primarySchools),     i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.secondarySchools),   i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.teams),              i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.participants),       i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.male),               i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.female),             i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      })),
      new TableRow({
        children: [
          dCell("JUMLAH",                    LBLUE, AlignmentType.LEFT, true),
          dCell(n(stateTotals.schoolContingents), LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.primarySchools),    LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.secondarySchools),  LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.teams),             LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.participants),      LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.male),              LBLUE, AlignmentType.RIGHT, true),
          dCell(n(stateTotals.female),            LBLUE, AlignmentType.RIGHT, true),
        ],
      }),
    ],
  });

  // ── 4. Competitions by education level ────────────────────────────────────
  const compHdrs = ["KOD", "PERTANDINGAN", "PASUKAN", "PESERTA"];
  const levelRows: TableRow[] = [new TableRow({ children: compHdrs.map(h => hCell(h)) })];
  const maxTeams = Math.max(...competitions.map(c => c.teams), 1);

  for (const level of LEVEL_ORDER) {
    const group = competitions
      .filter(c => c.schoolLevels.includes(level))
      .sort((a, b) => a.code.localeCompare(b.code));
    if (!group.length) continue;

    levelRows.push(new TableRow({
      children: [groupCell(LEVEL_LABEL[level] ?? level, 4, LBLUE)],
    }));

    group.forEach((c, i) => {
      levelRows.push(new TableRow({
        children: [
          dCell(c.code,           i % 2 === 0 ? WHITE : GREY),
          dCell(c.name,           i % 2 === 0 ? WHITE : GREY),
          dCell(n(c.teams),       i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(c.participants),i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      }));
    });

    // Bar chart row for this level (visual)
    const barMax = Math.max(...group.map(c => c.teams), 1);
    group.forEach((c) => {
      const barStr = "█".repeat(Math.max(1, Math.round(c.teams / barMax * 18)));
      levelRows.push(new TableRow({
        children: [
          dCell(c.code, LGREY),
          new TableCell({
            columnSpan: 3,
            children: [new Paragraph({ children: [new TextRun({ text: barStr, size: 16, color: "3B82F6" })] })],
            shading: { type: ShadingType.CLEAR, fill: LGREY, color: "auto" },
            borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
          }),
        ],
      }));
    });

    const subT = group.reduce((s, c) => s + c.teams, 0);
    const subP = group.reduce((s, c) => s + c.participants, 0);
    levelRows.push(new TableRow({
      children: [
        dCell(`Jumlah ${LEVEL_LABEL[level] ?? level}`, LVIOL, AlignmentType.LEFT, true, "4C1D95"),
        dCell("", LVIOL),
        dCell(n(subT), LVIOL, AlignmentType.RIGHT, true, VIOLET),
        dCell(n(subP), LVIOL, AlignmentType.RIGHT, true, VIOLET),
      ],
    }));
  }
  const levelTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: levelRows });

  // ── 5. Competitions by state ──────────────────────────────────────────────
  const compMap = new Map(competitions.map(c => [c.id, c]));
  const stateCompMap = new Map<string, CompetitionStateStat[]>();
  for (const r of competitionStateStats) {
    const arr = stateCompMap.get(r.stateName) ?? [];
    arr.push(r);
    stateCompMap.set(r.stateName, arr);
  }

  const stateCompHdrs = ["KOD", "PERTANDINGAN", "PASUKAN", "PESERTA"];
  const stateCompRows: TableRow[] = [new TableRow({ children: stateCompHdrs.map(h => hCell(h)) })];

  for (const [stateName, rows] of [...stateCompMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = rows
      .map(r => ({ ...r, comp: compMap.get(r.competitionId) }))
      .filter(r => r.comp)
      .sort((a, b) => a.comp!.code.localeCompare(b.comp!.code));

    stateCompRows.push(new TableRow({
      children: [groupCell(stateName, 4, LGREY)],
    }));

    sorted.forEach((r, i) => {
      stateCompRows.push(new TableRow({
        children: [
          dCell(r.comp!.code,      i % 2 === 0 ? WHITE : GREY),
          dCell(r.comp!.name,      i % 2 === 0 ? WHITE : GREY),
          dCell(n(r.teams),        i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
          dCell(n(r.participants), i % 2 === 0 ? WHITE : GREY, AlignmentType.RIGHT),
        ],
      }));
    });

    const subT = sorted.reduce((s, r) => s + r.teams, 0);
    const subP = sorted.reduce((s, r) => s + r.participants, 0);
    stateCompRows.push(new TableRow({
      children: [
        dCell(`Jumlah ${stateName}`, LBLUE, AlignmentType.LEFT, true),
        dCell("", LBLUE),
        dCell(n(subT), LBLUE, AlignmentType.RIGHT, true),
        dCell(n(subP), LBLUE, AlignmentType.RIGHT, true),
      ],
    }));
  }
  const stateCompTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: stateCompRows });

  // ── Assemble document ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
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
          children: [new TextRun({ text: "LAPORAN STATISTIK PENYERTAAN", bold: true, color: "1D4ED8", size: 32 })],
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
        heading("3. Pecahan Mengikut Negeri"),
        stateTable,
        heading("4. Pertandingan Mengikut Tahap Pendidikan"),
        levelTable,
        heading("5. Pertandingan Mengikut Negeri"),
        stateCompTable,
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: "— Tamat Laporan —", size: 18, color: "9CA3AF", italics: true })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Laporan-Penyertaan-${slug}.docx`);
}
