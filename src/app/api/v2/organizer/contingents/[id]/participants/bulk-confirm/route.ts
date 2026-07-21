import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Gender, EduLevel, Ethnicity } from "@prisma/client";

type BulkRow = {
  name: string; ic: string | null; email: string | null; phoneNumber: string | null;
  gender: Gender; age: number | null; eduLevel: EduLevel;
  classGrade: string | null; className: string | null;
  ethnicity: Ethnicity | null; ppki: boolean;
};

// POST /api/v2/organizer/contingents/[id]/participants/bulk-confirm
// Body: { rows: BulkRow[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contingent = await db.contingent.findUnique({ where: { id }, select: { id: true } });
  if (!contingent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { rows }: { rows: BulkRow[] } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });

  const created = await db.participant.createMany({
    data: rows.map((r) => ({
      contingentId: id,
      name:        r.name,
      ic:          r.ic          || null,
      email:       r.email       || null,
      phoneNumber: r.phoneNumber || null,
      gender:      r.gender,
      age:         r.age         ?? null,
      eduLevel:    r.eduLevel,
      classGrade:  r.classGrade  || null,
      className:   r.className   || null,
      ethnicity:   r.ethnicity   || null,
      ppki:        r.ppki        ?? false,
      status:      "ACTIVE",
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({ created: created.count }, { status: 201 });
}
