import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

type ParticipantRow = {
  id:              string;
  name:            string;
  gender:          string;
  contingentId:    string | null;
  contingentName:  string | null;
  contingentType:  string | null;
  ppd:             string | null;
  teamName:        string;
  stateName:       string | null;
  competitionCode: string;
  competitionName: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { searchParams } = req.nextUrl;
  const q             = (searchParams.get("q") ?? "").trim();
  const competitionId = searchParams.get("competitionId") ?? "";
  const stateId       = searchParams.get("stateId") ?? "";
  const targetGroupId = searchParams.get("targetGroupId") ?? "";

  const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const extraConditions = Prisma.sql`
    ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
    ${stateId ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}` : Prisma.empty}
    ${targetGroupId
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM target_groups tg WHERE tg.id = ${targetGroupId} AND ${targetGroupMatchSql("p", "tg")})`
      : Prisma.empty}
    ${q ? Prisma.sql`AND (p.name ILIKE ${"%" + q + "%"} OR t.name ILIKE ${"%" + q + "%"})` : Prisma.empty}
  `;

  const rows = await db.$queryRaw<ParticipantRow[]>`
    SELECT
      p.id,
      p.name,
      p.gender,
      cont.id   AS "contingentId",
      cont.name AS "contingentName",
      cont."contingentType" AS "contingentType",
      sch."ppdCode" AS ppd,
      t.name    AS "teamName",
      COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
      c.code    AS "competitionCode",
      c.name    AS "competitionName"
    FROM team_members tm
    JOIN contestants          p          ON p.id   = tm."contestantId"
    JOIN teams                t          ON t.id   = tm."teamId"
    JOIN team_events          te         ON te."teamId" = t.id AND te."eventId" = ${eventId}
    JOIN competitions         c          ON c.id   = t."competitionId"
    LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
    LEFT JOIN states          s          ON s.id   = cont."stateId"
    LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
    LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
    LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
    LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
    WHERE 1=1 ${extraConditions}
    ORDER BY cont.name NULLS LAST, c.code, t.name, p.name
  `;

  // ── Build ExcelJS workbook — 1 sheet per state ─────────────────────────────
  const wb = new ExcelJS.Workbook();

  const BORDER: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };

  // Group rows by state
  const byState = new Map<string, ParticipantRow[]>();
  for (const r of rows) {
    const key = r.stateName ?? "Lain-lain";
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key)!.push(r);
  }
  const stateKeys = [...byState.keys()].sort((a, b) =>
    a === "Lain-lain" ? 1 : b === "Lain-lain" ? -1 : a.localeCompare(b));

  // ── Sheet 1: Statistik (state → PPD summary) ───────────────────────────────
  type StatAgg = { contingents: Set<string>; participants: Set<string>; males: Set<string>; females: Set<string> };
  const statsByState = new Map<string, Map<string, StatAgg>>();

  for (const r of rows) {
    const state = r.stateName ?? "Lain-lain";
    const ppdLabel = r.contingentType === "SCHOOL" ? (r.ppd ?? "Lain-lain") : "Bukan Kontingen Sekolah";
    if (!statsByState.has(state)) statsByState.set(state, new Map());
    const m = statsByState.get(state)!;
    if (!m.has(ppdLabel)) {
      m.set(ppdLabel, { contingents: new Set(), participants: new Set(), males: new Set(), females: new Set() });
    }
    const a = m.get(ppdLabel)!;
    if (r.contingentId) a.contingents.add(r.contingentId);
    a.participants.add(r.id);
    if (r.gender === "MALE") a.males.add(r.id);
    else if (r.gender === "FEMALE") a.females.add(r.id);
  }

  const stWs = wb.addWorksheet("Statistik");
  stWs.columns = [
    { width: 32 }, // A PPD
    { width: 14 }, // B Jum. Sekolah
    { width: 14 }, // C Jum. Peserta
    { width: 10 }, // D Lelaki
    { width: 12 }, // E Perempuan
  ];

  let stRow = 1;
  for (const stateName of stateKeys) {
    const groups = statsByState.get(stateName)!;

    // State title row
    stWs.mergeCells(`A${stRow}:E${stRow}`);
    const titleCell = stWs.getCell(`A${stRow}`);
    titleCell.value = stateName.toUpperCase();
    titleCell.font      = { bold: true, size: 12, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    titleCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F7A1F" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    for (let i = 2; i <= 5; i++) stWs.getRow(stRow).getCell(i).fill = titleCell.fill;
    for (let i = 1; i <= 5; i++) stWs.getRow(stRow).getCell(i).border = BORDER;
    stWs.getRow(stRow).height = 22;
    stRow++;

    // Column header row
    ["PPD", "Jum. Sekolah", "Jum. Peserta", "Lelaki", "Perempuan"].forEach((h, i) => {
      const cell = stWs.getRow(stRow).getCell(i + 1);
      cell.value = h;
      cell.font      = { bold: true, size: 10, color: { argb: "FF1F3D1F" }, name: "Calibri" };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center" };
      cell.border    = BORDER;
    });
    stWs.getRow(stRow).height = 18;
    stRow++;

    // PPD rows
    let totConts = 0; const totParts = new Set<string>(); const totMale = new Set<string>(); const totFemale = new Set<string>();
    for (const ppd of [...groups.keys()].sort((a, b) =>
      a === "Lain-lain" || a === "Bukan Kontingen Sekolah" ? 1 :
      b === "Lain-lain" || b === "Bukan Kontingen Sekolah" ? -1 : a.localeCompare(b))) {
      const a = groups.get(ppd)!;
      a.participants.forEach(id => totParts.add(id));
      a.males.forEach(id => totMale.add(id));
      a.females.forEach(id => totFemale.add(id));
      totConts += a.contingents.size;

      const r = stWs.getRow(stRow);
      r.getCell(1).value = ppd;
      r.getCell(2).value = a.contingents.size;
      r.getCell(3).value = a.participants.size;
      r.getCell(4).value = a.males.size;
      r.getCell(5).value = a.females.size;
      r.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = BORDER;
        cell.font   = { name: "Calibri", size: 10 };
        cell.alignment = colNum === 1
          ? { vertical: "middle", horizontal: "left", wrapText: true }
          : { vertical: "middle", horizontal: "center" };
      });
      stRow++;
    }

    // State subtotal row
    const r = stWs.getRow(stRow);
    r.getCell(1).value = `Jumlah ${stateName}`;
    r.getCell(2).value = totConts;
    r.getCell(3).value = totParts.size;
    r.getCell(4).value = totMale.size;
    r.getCell(5).value = totFemale.size;
    r.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.border = BORDER;
      cell.font   = { name: "Calibri", size: 10, bold: true };
      cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
      cell.alignment = colNum === 1
        ? { vertical: "middle", horizontal: "left" }
        : { vertical: "middle", horizontal: "center" };
    });
    stWs.getRow(stRow).height = 18;
    stRow += 2; // blank separator row
  }

  const usedSheetNames = new Set<string>();
  for (const stateName of stateKeys) {
    const stateRows = byState.get(stateName)!;

    const sheetName = (stateName.replace(/[/\\?*[\]:]/g, "-").slice(0, 31) || "Peserta");
    const ws = wb.addWorksheet(usedSheetNames.has(sheetName) ? `${sheetName}~` : sheetName);
    usedSheetNames.add(ws.name);

    ws.columns = [
      { width: 28 }, // A Kontingen
      { width: 30 }, // B Pertandingan
      { width: 24 }, // C Pasukan
      { width: 6  }, // D Bil.
      { width: 46 }, // E Nama
    ];

    // Header row — green fill
    const headerRow = ws.getRow(1);
    ["Kontingen", "Pertandingan", "Pasukan", "Bil.", "Nama"].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F7A1F" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border    = BORDER;
    });
    headerRow.height = 22;

    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // ── Order: school contingents grouped by PPD, then other contingents ──────
    type Block = { label: string | null; rows: ParticipantRow[] }; // label = PPD section header (null = no header)
    const ppdMap  = new Map<string, ParticipantRow[]>(); // PPD → school-contingent rows
    const otherConts: ParticipantRow[] = [];             // non-school contingents

    for (const r of stateRows) {
      if (r.contingentType === "SCHOOL" && r.ppd) {
        if (!ppdMap.has(r.ppd)) ppdMap.set(r.ppd, []);
        ppdMap.get(r.ppd)!.push(r);
      } else {
        otherConts.push(r);
      }
    }

    const blocks: Block[] = [...ppdMap.keys()].sort().map((ppd) => {
      const rs = ppdMap.get(ppd)!;
      // Within a PPD: order by contingent → competition → team → name
      rs.sort((a, b) =>
        (a.contingentName ?? "").localeCompare(b.contingentName ?? "") ||
        a.competitionCode.localeCompare(b.competitionCode) ||
        a.teamName.localeCompare(b.teamName) ||
        a.name.localeCompare(b.name));
      return { label: ppd, rows: rs };
    });

    const seenOthers = new Set<string>();
    const otherBlocks: Block[] = [];
    for (const r of otherConts) {
      const key = r.contingentName ?? "";
      if (!seenOthers.has(key)) { seenOthers.add(key); otherBlocks.push({ label: null, rows: [r] }); }
      else otherBlocks.find(b => b.rows[0].contingentName === r.contingentName)!.rows.push(r);
    }
    blocks.push(...otherBlocks);

    let rowNum = 2;

    for (const block of blocks) {
      // PPD section header
      if (block.label) {
        ws.mergeCells(`A${rowNum}:E${rowNum}`);
        const c = ws.getCell(`A${rowNum}`);
        c.value     = block.label;
        c.font      = { bold: true, size: 10, color: { argb: "FF92400E" }, name: "Calibri" };
        c.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        c.alignment = { vertical: "middle", horizontal: "left" };
        for (let i = 2; i <= 5; i++) ws.getRow(rowNum).getCell(i).fill = c.fill;
        for (let i = 1; i <= 5; i++) ws.getRow(rowNum).getCell(i).border = BORDER;
        ws.getRow(rowNum).height = 18;
        rowNum++;
      }

      // Contingent blocks within this section
      let i = 0;
      while (i < block.rows.length) {
        const cont = block.rows[i].contingentName ?? "";
        let j = i;
        while (j < block.rows.length && (block.rows[j].contingentName ?? "") === cont) j++;
        const contRows = block.rows.slice(i, j);

        const contStart = rowNum;
        contRows.forEach((r, k) => {
          const wsRow = ws.getRow(rowNum);
          wsRow.getCell(1).value = cont;
          wsRow.getCell(2).value = `${r.competitionCode} — ${r.competitionName}`;
          wsRow.getCell(3).value = r.teamName;
          wsRow.getCell(4).value = k + 1;           // Bil. — sequential within contingent
          wsRow.getCell(5).value = r.name;
          wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.border = BORDER;
            cell.font   = { name: "Calibri", size: 10 };
            cell.alignment = colNum === 4
              ? { vertical: "middle", horizontal: "center" }
              : { vertical: "middle", horizontal: "left", wrapText: true };
          });
          rowNum++;
        });
        const contEnd = rowNum - 1;

        // Merge A per contingent
        if (contEnd > contStart) ws.mergeCells(`A${contStart}:A${contEnd}`);
        ws.getCell(`A${contStart}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

        // Merge B+C per team span
        let spanStart = 0;
        for (let k = 1; k <= contRows.length; k++) {
          const boundary = k === contRows.length || contRows[k].teamName !== contRows[k - 1].teamName;
          if (!boundary) continue;
          const s = contStart + spanStart;
          const e = contStart + k - 1;
          if (e > s) {
            ws.mergeCells(`B${s}:B${e}`);
            ws.mergeCells(`C${s}:C${e}`);
          }
          ws.getCell(`B${s}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          ws.getCell(`C${s}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          spanStart = k;
        }

        i = j;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="peserta-${event.slug}-berformat.xlsx"`,
    },
  });
}
