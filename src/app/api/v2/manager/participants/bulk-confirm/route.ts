import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Gender, EduLevel, Ethnicity } from "@prisma/client";

// ── POST /api/v2/manager/participants/bulk-confirm ───────────────────────────
// Body: { rows: ParsedRow[], contingentId: string }
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((c) => c.contingentId);
  const { rows, contingentId } = await req.json();

  if (!contingentIds.includes(contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  type ParsedRow = { name: string; ic?: string; email?: string; phoneNumber?: string; gender: Gender; age?: number; eduLevel: EduLevel; classGrade?: string; className?: string; ethnicity?: string; ppki?: boolean };
  const created = await db.participant.createMany({
    data: rows.map((r: ParsedRow) => ({
      name:        r.name,
      ic:          r.ic          ?? null,
      email:       r.email       ?? null,
      phoneNumber: r.phoneNumber ?? null,
      gender:      r.gender      as Gender,
      age:         r.age ? Number(r.age) : null,
      eduLevel:    r.eduLevel    as EduLevel,
      classGrade:  r.classGrade  ?? null,
      className:   r.className   ?? null,
      ethnicity:   (r.ethnicity  ?? null) as Ethnicity | null,
      ppki:        r.ppki        ?? false,
      contingentId,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({ count: created.count });
}
