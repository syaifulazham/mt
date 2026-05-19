import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const contingent = await db.contingent.findUnique({
    where: { id },
    include: {
      school:            { select: { id: true, name: true } },
      higherInstitution: { select: { id: true, name: true } },
      state:             { select: { id: true, name: true } },
      zone:              { select: { id: true, name: true } },
      managers: {
        where:   { status: "ACTIVE" },
        orderBy: { role: "asc" },
        include: { manager: { select: { id: true, name: true, email: true, phone: true } } },
      },
      participants: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, gender: true, eduLevel: true, ppki: true, age: true },
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
          competition: { select: { id: true, code: true, name: true, participationType: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!contingent) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: contingent });
}
