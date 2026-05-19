import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CriterionType } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: templateId } = await params;
  const body = await req.json();

  if (!body.name?.trim() || !body.type)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  if (!Object.values(CriterionType).includes(body.type))
    return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });

  // Determine next order value
  const last = await db.judgingCriterion.findFirst({
    where: { templateId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const criterion = await db.judgingCriterion.create({
    data: {
      templateId,
      name:     body.name.trim(),
      type:     body.type as CriterionType,
      order:    (last?.order ?? -1) + 1,
      maxScore: body.maxScore != null ? Number(body.maxScore) : null,
      minScore: body.minScore != null ? Number(body.minScore) : null,
      maxTime:  body.maxTime  != null ? Number(body.maxTime)  : null,
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ criterion }, { status: 201 });
}
