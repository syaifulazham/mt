import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public — fetch endpoint info by routeCode (no auth required)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const endpoint = await db.attendanceEndpoint.findUnique({
    where: { routeCode: code },
    select: {
      id: true,
      label: true,
      active: true,
      retiredAt: true,
      event: { select: { id: true, name: true, slug: true, venue: true } },
    },
  });

  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ data: endpoint });
}
