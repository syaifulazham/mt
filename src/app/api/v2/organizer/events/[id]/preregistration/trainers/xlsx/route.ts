import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

type TrainerRow = {
  name:               string;
  email:              string | null;
  phoneNumber:        string | null;
  contingentId:       string | null;
  contingentName:     string | null;
  stateName:          string | null;
  teams:              bigint;
  participants:       bigint;
  teamNames:          string[] | null;
  uniqueTeams:        bigint;
  uniqueParticipants: bigint;
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

  const extraConditions = Prisma.sql`
    ${competitionId ? Prisma.sql`AND c.id = ${competitionId}` : Prisma.empty}
    ${stateId
      ? Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${stateId}`
      : Prisma.empty}
    ${targetGroupId
      ? Prisma.sql`AND EXISTS (
          SELECT 1
          FROM team_members tm2
          JOIN contestants   p2 ON p2.id = tm2."contestantId"
          JOIN target_groups tg ON tg.id = ${targetGroupId}
          WHERE tm2."teamId" = t.id AND ${targetGroupMatchSql("p2", "tg")}
        )`
      : Prisma.empty}
    ${q
      ? Prisma.sql`AND (tr.name ILIKE ${"%" + q + "%"} OR tr.email ILIKE ${"%" + q + "%"} OR tr."phoneNumber" ILIKE ${"%" + q + "%"} OR cont.name ILIKE ${"%" + q + "%"})`
      : Prisma.empty}
  `;

  const rows = await db.$queryRaw<TrainerRow[]>`
    WITH contingent_stats AS (
      SELECT
        t."contingentId",
        COUNT(DISTINCT t.id)               AS unique_teams,
        COUNT(DISTINCT tm2."contestantId") AS unique_participants
      FROM teams t
      JOIN team_events te2 ON te2."teamId" = t.id AND te2."eventId" = ${eventId}
      LEFT JOIN team_members tm2 ON tm2."teamId" = t.id
      GROUP BY t."contingentId"
    )
    SELECT
      tr.name,
      tr.email,
      tr."phoneNumber",
      cont.id    AS "contingentId",
      cont.name  AS "contingentName",
      COALESCE(s.name, sch_state.name, hi_state.name) AS "stateName",
      COUNT(DISTINCT t.id)               AS teams,
      COUNT(DISTINCT tm."contestantId")  AS participants,
      ARRAY_AGG(DISTINCT t.name ORDER BY t.name) AS "teamNames",
      COALESCE(cs.unique_teams, 0)        AS "uniqueTeams",
      COALESCE(cs.unique_participants, 0) AS "uniqueParticipants"
    FROM trainers tr
    JOIN team_trainers        tt  ON tt."trainerId" = tr.id
    JOIN teams                t   ON t.id   = tt."teamId"
    JOIN team_events          te  ON te."teamId"  = t.id  AND te."eventId" = ${eventId}
    JOIN competitions         c   ON c.id   = t."competitionId"
    LEFT JOIN team_members    tm  ON tm."teamId" = t.id
    LEFT JOIN contingents     cont ON cont.id = tr."contingentId"
    LEFT JOIN contingent_stats cs  ON cs."contingentId" = cont.id
    LEFT JOIN states          s    ON s.id   = cont."stateId"
    LEFT JOIN schools         sch  ON sch.id = cont."schoolId"
    LEFT JOIN states     sch_state ON sch_state.id = sch."stateId"
    LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
    LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
    WHERE 1=1 ${extraConditions}
    GROUP BY tr.id, tr.name, tr.email, tr."phoneNumber",
      cont.id, cont.name,
      COALESCE(s.name, sch_state.name, hi_state.name),
      cs.unique_teams, cs.unique_participants
    ORDER BY cont.name, tr.name
  `;

  // ── Build ExcelJS workbook ──────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jurulatih");

  ws.columns = [
    { header: "Kontinjen",         key: "kontinjen",       width: 38 },
    { header: "Negeri",            key: "negeri",          width: 15 },
    { header: "Nama",              key: "nama",            width: 25 },
    { header: "Email",             key: "email",           width: 30 },
    { header: "Telefon",           key: "telefon",         width: 15 },
    { header: "Pasukan",           key: "pasukan",         width: 45 },
    { header: "Bilangan Pasukan",  key: "bilanganPasukan", width: 16 },
    { header: "Bilangan Peserta",  key: "bilanganPeserta", width: 16 },
    { header: "Bil. Unik Pasukan", key: "unikPasukan",     width: 17 },
    { header: "Bil. Unik Peserta", key: "unikPeserta",     width: 17 },
  ];

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.height = 32;
  headerRow.eachCell(cell => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border    = { bottom: { style: "medium", color: { argb: "FF4472C4" } } };
  });

  const FILL_A = "FFDBEAFE"; // light blue
  const FILL_B = "FFFFFFFF"; // white
  const BORDER_COLOR = "FFE2E8F0";

  let fillToggle   = false;
  let currentCont  = "";
  let mergeStart   = 2;

  function applyMerge(startRow: number, endRow: number) {
    if (endRow > startRow) {
      ws.mergeCells(`I${startRow}:I${endRow}`);
      ws.mergeCells(`J${startRow}:J${endRow}`);
    }
    ws.getCell(`I${startRow}`).alignment = { vertical: "middle", horizontal: "center" };
    ws.getCell(`J${startRow}`).alignment = { vertical: "middle", horizontal: "center" };
  }

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const contName = r.contingentName ?? "";

    if (contName !== currentCont) {
      if (idx > 0) applyMerge(mergeStart, rowNum - 1);
      mergeStart  = rowNum;
      currentCont = contName;
      fillToggle  = !fillToggle;
    }

    const fill: ExcelJS.Fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: fillToggle ? FILL_A : FILL_B },
    };
    const border: Partial<ExcelJS.Borders> = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };

    const wsRow = ws.addRow({
      kontinjen:       contName,
      negeri:          r.stateName      ?? "",
      nama:            r.name,
      email:           r.email          ?? "",
      telefon:         r.phoneNumber    ?? "",
      pasukan:         (r.teamNames ?? []).join("\n"),
      bilanganPasukan: Number(r.teams),
      bilanganPeserta: Number(r.participants),
      unikPasukan:     Number(r.uniqueTeams),
      unikPeserta:     Number(r.uniqueParticipants),
    });

    wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill   = fill;
      cell.border = border;
      cell.font   = { name: "Calibri", size: 10 };
      cell.alignment = colNum === 6
        ? { vertical: "top", wrapText: true }
        : { vertical: "middle" };
    });
  });

  // Close last group
  const lastRow = rows.length + 1;
  if (rows.length > 0) applyMerge(mergeStart, lastRow);

  // Freeze header row
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jurulatih-${eventId}.xlsx"`,
    },
  });
}
