// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; teamId: string; teamName: string;
  contingentName: string; contingentLogo: string | null;
  totalScore: number; bestTime: number | null;
  selected: boolean;
};

type StateGroup = {
  stateId: string; stateName: string; bestScore: number;
  teams: RankEntry[];
};

type CompetitionRanking = {
  id: string; name: string; code: string;
  targetGroup: { id: string; code: string; name: string } | null;
  rankings: RankEntry[];
  stateGroups: StateGroup[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60); const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ── Row background colours ─────────────────────────────────────────────────────

function rowBg(rank: number, idx: number): string {
  if (rank === 1) return "FFFFF9C4";
  if (rank === 2) return "FFF5F5F5";
  if (rank === 3) return "FFFFF3E0";
  return idx % 2 === 0 ? "FFFFFFFF" : "FFFAFAFA";
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function exportResultsExcel({
  eventName,
  competitions,
  rankedBy,
}: {
  eventName: string;
  competitions: CompetitionRanking[];
  rankedBy: "national" | "state";
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  for (const comp of competitions) {
    const sheetName = comp.code.slice(0, 31);
    const ws = wb.addWorksheet(sheetName);

    // ── Column widths ─────────────────────────────────────────────────────────
    ws.columns = [
      { width: 8 },   // A  #
      { width: 32 },  // B  Pasukan
      { width: 36 },  // C  Kontinjen
      { width: 12 },  // D  Markah
      { width: 12 },  // E  Masa
    ];

    let currentRow = 1;

    // ── Row 1: Target group (optional) ────────────────────────────────────────
    if (comp.targetGroup) {
      const tgRow = ws.getRow(currentRow);
      ws.mergeCells(`A${currentRow}:E${currentRow}`);
      const tgCell = tgRow.getCell(1);
      tgCell.value = comp.targetGroup.name;
      tgCell.font = { bold: true, italic: true, size: 11, color: { argb: "FF6B7280" } };
      tgRow.commit();
      currentRow++;
    }

    // ── Row 2: Competition title ───────────────────────────────────────────────
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    const titleCell = ws.getCell(`A${currentRow}`);
    titleCell.value = `[${comp.code}] ${comp.name}`;
    titleCell.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    currentRow++;

    // ── Row 3: Event name ─────────────────────────────────────────────────────
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    const evtCell = ws.getCell(`A${currentRow}`);
    evtCell.value = eventName;
    evtCell.font = { italic: true, size: 10, color: { argb: "FF9CA3AF" } };
    currentRow++;

    // ── Row 4: Empty ──────────────────────────────────────────────────────────
    currentRow++;

    // ── Row 5: Header ─────────────────────────────────────────────────────────
    const headerRowNum = currentRow;
    const hRow = ws.getRow(headerRowNum);
    const headers = ["#", "PASUKAN", "KONTINJEN", "MARKAH", "MASA"];
    const hAlignments: ("center" | "left")[] = ["center", "left", "left", "center", "center"];

    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9F1239" } };
      cell.alignment = { horizontal: hAlignments[i], vertical: "middle" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF881337" } },
      };
    });
    hRow.commit();
    currentRow++;

    // ── Freeze pane at header row ─────────────────────────────────────────────
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowNum, topLeftCell: `A${headerRowNum + 1}` }];

    // ── Data rows ─────────────────────────────────────────────────────────────
    const useStateGroups = rankedBy === "state" && comp.stateGroups.length > 0;

    function addTeamRow(r: RankEntry, idx: number) {
      const rn = currentRow;
      const dRow = ws.getRow(rn);
      const bg = rowBg(r.rank, idx);

      // Col A: rank
      const rankCell = dRow.getCell(1);
      rankCell.value = r.rank;
      rankCell.alignment = { horizontal: "center", vertical: "middle" };
      rankCell.font = { bold: r.rank <= 3, color: { argb: "FF374151" } };
      rankCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      // Col B: team name
      const nameCell = dRow.getCell(2);
      nameCell.value = r.teamName;
      nameCell.alignment = { horizontal: "left", vertical: "middle" };
      nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      // Col C: contingent
      const contCell = dRow.getCell(3);
      contCell.value = r.contingentName;
      contCell.alignment = { horizontal: "left", vertical: "middle" };
      contCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      // Col D: score
      const scoreCell = dRow.getCell(4);
      scoreCell.value = r.totalScore.toFixed(1);
      scoreCell.alignment = { horizontal: "center", vertical: "middle" };
      scoreCell.font = {
        bold: true,
        color: { argb: r.rank <= 3 ? "FF9F1239" : "FF374151" },
      };
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      // Col E: time
      const timeCell = dRow.getCell(5);
      timeCell.value = r.bestTime != null ? fmtTime(r.bestTime) : "—";
      timeCell.alignment = { horizontal: "center", vertical: "middle" };
      timeCell.font = { color: { argb: "FF0369A1" } };
      timeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      dRow.commit();
      currentRow++;
    }

    if (useStateGroups) {
      let teamIdx = 0;
      for (const group of comp.stateGroups) {
        // State header row
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        const sHdrCell = ws.getCell(`A${currentRow}`);
        sHdrCell.value = group.stateName.toUpperCase();
        sHdrCell.font = { bold: true, color: { argb: "FF1E3A5F" } };
        sHdrCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        ws.getRow(currentRow).commit();
        currentRow++;

        for (const team of group.teams) {
          addTeamRow(team, teamIdx++);
        }
      }
    } else {
      comp.rankings.forEach((r, idx) => addTeamRow(r, idx));
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const slug = slugify(eventName);
  const filename = `keputusan-${slug}-${dateStamp()}.xlsx`;
  triggerDownload(buffer as ArrayBuffer, filename);
}
