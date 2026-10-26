import type { WorkshopParticipant } from "@/lib/workshopStats";

// Workshop (EptimEdu course) participants → XLSX (client-side, ExcelJS):
// a "Ringkasan" sheet with counts per state, then one sheet per state listing
// participants grouped by school.

const C = {
  brand:     "FF085782", // workshop blue (matches the page)
  brandDark: "FF053A57",
  brandSoft: "FFE3EFF6",
  brandLine: "FF9CC3DA",
  head:      "FF334155", // slate-700
  white:     "FFFFFFFF",
  zebra:     "FFF8FAFC", // slate-50
  line:      "FFE2E8F0", // slate-200
  muted:     "FF64748B", // slate-500
  male:      { fg: "FF1D4ED8", bg: "FFDBEAFE" },
  female:    { fg: "FFBE185D", bg: "FFFCE7F3" },
  total:     "FFF1F5F9",
};
const TAB_COLORS = ["FF085782", "FF0E7490", "FF0F766E", "FF4338CA", "FF7C3AED", "FFB45309", "FFBE123C"];

const FONT = "Calibri";
const TITLE_FONT = "Calibri Light";

const COLS: { header: string; width: number; align?: "left" | "center" | "right" }[] = [
  { header: "Bil.",               width: 6,  align: "center" },
  { header: "Nama Peserta",       width: 42 },
  { header: "Umur",               width: 7,  align: "center" },
  { header: "Jantina",            width: 12, align: "center" },
  { header: "Darjah / Tingkatan", width: 18, align: "center" },
  { header: "Etnik",              width: 18 },
  { header: "Pasukan",            width: 30 },
];

function sheetName(name: string, used: Set<string>) {
  // Excel caps sheet names at 31 chars — "Wilayah Persekutuan Kuala Lumpur" is 32.
  const base = name.replace(/^Wilayah Persekutuan\s+/i, "WP ").replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Negeri";
  let n = base, i = 2;
  while (used.has(n)) n = `${base.slice(0, 27)} (${i++})`;
  used.add(n);
  return n;
}

const byText = (a: string, b: string) => a.localeCompare(b, "ms", { numeric: true, sensitivity: "base" });

export async function exportWorkshopParticipantsExcel({ title, competitions, participants }: {
  title: string;
  competitions: string; // e.g. "4.1R Cabaran Robot Tempur"
  participants: WorkshopParticipant[];
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  type Worksheet = import("exceljs").Worksheet;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Techlympics";
  wb.created = new Date();
  const used = new Set<string>();
  const generated = new Date().toLocaleString("ms-MY", { dateStyle: "long", timeStyle: "short" });
  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

  // state → school key → participants
  const states = new Map<string, Map<string, WorkshopParticipant[]>>();
  for (const p of participants) {
    let schools = states.get(p.state);
    if (!schools) states.set(p.state, (schools = new Map()));
    const key = `${p.school}\u0000${p.schoolCode ?? ""}`;
    (schools.get(key) ?? schools.set(key, []).get(key)!).push(p);
  }
  const stateNames = [...states.keys()].sort(byText);

  function titleBlock(ws: Worksheet, lastCol: number, heading: string, subline: string) {
    ws.mergeCells(1, 1, 1, lastCol);
    const t = ws.getCell(1, 1);
    t.value = heading;
    t.font = { name: TITLE_FONT, size: 16, bold: true, color: { argb: C.white } };
    t.fill = solid(C.brand);
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;

    ws.mergeCells(2, 1, 2, lastCol);
    const s = ws.getCell(2, 1);
    s.value = subline;
    s.font = { name: FONT, size: 10, italic: true, color: { argb: C.brandDark } };
    s.fill = solid(C.brandSoft);
    s.alignment = { vertical: "middle", indent: 1, wrapText: true };
    ws.getRow(2).height = 30;
  }

  function headerRow(ws: Worksheet, r: number, headers: { header: string; align?: string }[]) {
    const row = ws.getRow(r);
    headers.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
      cell.fill = solid(C.head);
      cell.alignment = { horizontal: (c.align ?? "left") as "left", vertical: "middle", wrapText: true };
      cell.border = border;
    });
    row.height = 20;
  }

  // ── Summary sheet ─────────────────────────────────────────────────────────
  {
    const SUM = [
      { header: "Negeri",    width: 26 },
      { header: "Sekolah",   width: 11, align: "right" },
      { header: "Peserta",   width: 11, align: "right" },
      { header: "Lelaki",    width: 11, align: "right" },
      { header: "Perempuan", width: 11, align: "right" },
    ];
    const ws = wb.addWorksheet(sheetName("Ringkasan", used), {
      views: [{ state: "frozen", ySplit: 4 }],
      properties: { tabColor: { argb: C.brandDark } },
      pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    ws.columns = SUM.map((c) => ({ width: c.width }));
    titleBlock(ws, SUM.length, title,
      `${competitions}  ·  ${participants.length.toLocaleString()} peserta berdaftar  ·  Dijana ${generated}`);
    headerRow(ws, 4, SUM);

    let r = 5;
    let tSchools = 0, tMale = 0, tFemale = 0;
    stateNames.forEach((st, i) => {
      const schools = states.get(st)!;
      const list = [...schools.values()].flat();
      const male = list.filter((p) => p.gender === "Lelaki").length;
      const female = list.filter((p) => p.gender === "Perempuan").length;
      tSchools += schools.size; tMale += male; tFemale += female;
      const row = ws.getRow(r++);
      row.values = [st, schools.size, list.length, male, female];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > SUM.length) return;
        cell.font = { name: FONT, size: 10 };
        cell.fill = solid(i % 2 ? C.zebra : C.white);
        cell.alignment = { horizontal: (SUM[col - 1].align ?? "left") as "left", vertical: "middle" };
        cell.border = border;
        if (col > 1) cell.numFmt = "#,##0";
      });
    });
    const tr = ws.getRow(r);
    tr.values = ["Jumlah", tSchools, participants.length, tMale, tFemale];
    tr.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > SUM.length) return;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.brandDark } };
      cell.fill = solid(C.total);
      cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
      cell.border = { ...border, top: { style: "medium", color: { argb: C.brandLine } } };
      if (col > 1) cell.numFmt = "#,##0";
    });
  }

  // ── One sheet per state ───────────────────────────────────────────────────
  const last = COLS.length;
  stateNames.forEach((st, si) => {
    const schools = states.get(st)!;
    const count = [...schools.values()].reduce((s, l) => s + l.length, 0);
    const ws = wb.addWorksheet(sheetName(st, used), {
      views: [{ state: "frozen", ySplit: 4 }],
      properties: { tabColor: { argb: TAB_COLORS[si % TAB_COLORS.length] } },
      pageSetup: {
        orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
        printTitlesRow: "4:4",
      },
    });
    ws.columns = COLS.map((c) => ({ width: c.width }));
    titleBlock(ws, last, `${st}  —  ${title}`,
      `${competitions}  ·  ${schools.size} sekolah  ·  ${count.toLocaleString()} peserta  ·  Dijana ${generated}`);
    headerRow(ws, 4, COLS);

    let r = 5;
    const schoolKeys = [...schools.keys()].sort(byText);
    for (const key of schoolKeys) {
      const list = schools.get(key)!.sort((a, b) =>
        byText(a.classGrade ?? "~", b.classGrade ?? "~") || byText(a.name, b.name));
      const first = list[0];

      // School band
      ws.mergeCells(r, 1, r, last);
      const sh = ws.getCell(r, 1);
      sh.value = {
        richText: [
          { text: first.school, font: { name: FONT, size: 11, bold: true, color: { argb: C.brandDark } } },
          ...(first.schoolCode
            ? [{ text: `  (${first.schoolCode})`, font: { name: FONT, size: 10, color: { argb: C.muted } } }]
            : []),
          { text: `   ·   ${first.schoolCategory}   ·   ${list.length} peserta`,
            font: { name: FONT, size: 10, color: { argb: C.brandDark } } },
        ],
      };
      sh.fill = solid(C.brandSoft);
      sh.alignment = { vertical: "middle", indent: 1 };
      sh.border = {
        top: { style: "medium", color: { argb: C.brandLine } },
        bottom: { style: "thin", color: { argb: C.brandLine } },
      };
      ws.getRow(r).height = 21;
      r++;

      list.forEach((p, i) => {
        const row = ws.getRow(r++);
        row.values = [i + 1, p.name, p.age ?? "", p.gender, p.classGrade ?? "", p.ethnicity, p.team];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col > last) return;
          cell.font = { name: FONT, size: 10 };
          cell.fill = solid(i % 2 ? C.zebra : C.white);
          cell.alignment = { horizontal: COLS[col - 1].align ?? "left", vertical: "middle" };
          cell.border = border;
        });
        const g = p.gender === "Lelaki" ? C.male : p.gender === "Perempuan" ? C.female : null;
        if (g) {
          const cell = row.getCell(4);
          cell.font = { name: FONT, size: 10, bold: true, color: { argb: g.fg } };
          cell.fill = solid(g.bg);
        }
        row.getCell(1).font = { name: FONT, size: 10, color: { argb: C.muted } };
      });
      r++; // gap between schools
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
  a.href = url;
  a.download = `bengkel-${slug || "peserta"}-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
