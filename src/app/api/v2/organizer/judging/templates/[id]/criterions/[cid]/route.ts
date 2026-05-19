import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CriterionType } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string; cid: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { cid } = await params;
  const body = await req.json();

  if (body.type && !Object.values(CriterionType).includes(body.type))
    return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });

  try {
    const criterion = await db.judgingCriterion.update({
      where: { id: cid },
      data: {
        ...(body.name     !== undefined && { name:     body.name?.trim() }),
        ...(body.type     !== undefined && { type:     body.type as CriterionType }),
        ...(body.order    !== undefined && { order:    Number(body.order) }),
        ...(body.maxScore !== undefined && { maxScore: body.maxScore != null ? Number(body.maxScore) : null }),
        ...(body.minScore !== undefined && { minScore: body.minScore != null ? Number(body.minScore) : null }),
        ...(body.maxTime  !== undefined && { maxTime:  body.maxTime  != null ? Number(body.maxTime)  : null }),
      },
      include: { options: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ criterion });
  } catch (e) {
    return NextResponse.json({ error: "UPDATE_FAILED", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { cid } = await params;
  try {
    await db.judgingCriterion.delete({ where: { id: cid } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: String(e) }, { status: 500 });
  }
}
