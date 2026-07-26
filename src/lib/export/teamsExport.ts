type TeamRow = {
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  competitionCode: string;
  competitionName: string;
  targetGroupCode: string | null;
  targetGroupName: string | null;
  members: number;
  memberNames: string;
};

export async function exportTeamsExcel(
  eventName: string,
  eventSlug: string,
  rows: TeamRow[],
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  // Group rows by competitionCode
  const groups = new Map<string, TeamRow[]>();
  for (const row of rows) {
    const key = row.competitionCode;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Sort groups by competitionCode
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const compCode of sortedKeys) {
    const compRows = groups.get(compCode)!;
    const firstRow = compRows[0];
    const competitionName = firstRow.competitionName;
    const targetGroupName = firstRow.targetGroupName ?? null;

    // Sheet name: max 31 chars, sanitise "/" → "-"
    const sheetName = compCode.replace(/\//g, "-").slice(0, 31);
    const ws = wb.addWorksheet(sheetName);

    // Column widths: A=22, B=36, C=30, D=10, E=50
    ws.columns = [
      { width: 22 },
      { width: 36 },
      { width: 30 },
      { width: 10 },
      { width: 50 },
    ];

    let currentRow = 1;

    // Row 1 (target group label) — only if targetGroupName exists
    if (targetGroupName) {
      const r1 = ws.getRow(currentRow);
      ws.mergeCells(`A${currentRow}:E${currentRow}`);
      r1.getCell(1).value = targetGroupName.toUpperCase();
      r1.getCell(1).font = { bold: true, size: 11, color: { argb: "FF6B7280" } };
      r1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
      r1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      r1.height = 18;
      currentRow++;
    }

    // Row 2: competition code + name
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    const r2 = ws.getRow(currentRow);
    r2.getCell(1).value = `${compCode} ${competitionName}`;
    r2.getCell(1).font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    r2.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    r2.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r2.height = 22;
    currentRow++;

    // Row 3: event name
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    const r3 = ws.getRow(currentRow);
    r3.getCell(1).value = eventName;
    r3.getCell(1).font = { italic: true, size: 10, color: { argb: "FF9CA3AF" } };
    r3.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r3.height = 16;
    currentRow++;

    // Row 4: empty
    ws.getRow(currentRow).height = 8;
    currentRow++;

    // Row 5: header
    const headerRow = ws.getRow(currentRow);
    const headers = ["NEGERI", "KONTINGEN", "PASUKAN", "BIL. AHLI", "NAMA AHLI"];
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C75" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: h === "BIL. AHLI" ? "center" : "left",
        wrapText: false,
      };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF0F4C75" } },
      };
    });
    headerRow.height = 20;
    const headerRowNum = currentRow;
    currentRow++;

    // Freeze pane below header
    ws.views = [{ state: "frozen", ySplit: headerRowNum, activeCell: `A${currentRow}` }];

    // Data rows
    for (let i = 0; i < compRows.length; i++) {
      const team = compRows[i];
      const dataRow = ws.getRow(currentRow);
      const isZeroMember = team.members === 0;

      const bgColor = isZeroMember
        ? "FFFCE8E8"
        : i % 2 === 0
          ? "FFFFFFFF"
          : "FFF0F4F8";

      const textColor = isZeroMember ? "FF991B1B" : "FF0F172A";

      const values = [
        team.stateName ?? "—",
        team.contingentName ?? "—",
        team.teamName,
        team.members,
        team.memberNames,
      ];

      values.forEach((val, idx) => {
        const cell = dataRow.getCell(idx + 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell.value = val as any;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.font = {
          size: idx === 4 ? 9 : 10,
          color: { argb: textColor },
          bold: isZeroMember && idx === 3 ? true : false,
        };
        cell.alignment = {
          vertical: "top",
          horizontal: idx === 3 ? "center" : "left",
          wrapText: idx === 4,
        };
      });

      dataRow.height = 15;
      currentRow++;
    }

    // Total row
    const totalRow = ws.getRow(currentRow);
    ws.mergeCells(`A${currentRow}:C${currentRow}`);
    totalRow.getCell(1).value = "JUMLAH";
    totalRow.getCell(1).font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
    totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

    const totalCountCell = totalRow.getCell(4);
    totalCountCell.value = compRows.length;
    totalCountCell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
    totalCountCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    totalCountCell.alignment = { vertical: "middle", horizontal: "center" };

    totalRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    totalRow.height = 18;
  }

  // Generate file and trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `pasukan-${eventSlug}-${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
