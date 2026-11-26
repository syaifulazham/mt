import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeAttendanceListData, type AttendanceBasis } from "@/lib/reports/attendanceListData";
import { buildAttendanceListDocx } from "@/lib/export/attendanceListDocx";

// Senarai Kehadiran Penyertaan as Word (see attendanceListDocx.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const basis: AttendanceBasis = req.nextUrl.searchParams.get("mode") === "individual" ? "individual" : "counter";
  const mode = req.nextUrl.searchParams.get("kategori") === "online" ? "ONLINE" : "BERSEMUKA";
  const d = await computeAttendanceListData(event.id, basis, mode);
  if (!d) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const buffer = await buildAttendanceListDocx(d);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Senarai-Kehadiran-Penyertaan-${event.slug}${mode === "ONLINE" ? "-dalam-talian" : ""}.docx"`,
    },
  });
}
