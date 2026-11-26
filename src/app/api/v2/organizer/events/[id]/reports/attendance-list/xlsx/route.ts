import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeAttendanceListData, type AttendanceBasis, type ListMode } from "@/lib/reports/attendanceListData";
import { buildAttendanceListXlsx, type XlsxLayout } from "@/lib/export/attendanceListXlsx";

// Senarai Kehadiran Penyertaan as Excel (see attendanceListXlsx.ts).
// ?layout=single|multi · ?kategori=online · ?mode=individual
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const basis: AttendanceBasis = sp.get("mode") === "individual" ? "individual" : "counter";
  const mode: ListMode = sp.get("kategori") === "online" ? "ONLINE" : "BERSEMUKA";
  const layout: XlsxLayout = sp.get("layout") === "multi" ? "multi" : "single";
  const d = await computeAttendanceListData(event.id, basis, mode);
  if (!d) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const buffer = await buildAttendanceListXlsx(d, layout);
  const name = `Senarai-Kehadiran-Penyertaan-${event.slug}${mode === "ONLINE" ? "-dalam-talian" : ""}${layout === "multi" ? "-berbilang" : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
