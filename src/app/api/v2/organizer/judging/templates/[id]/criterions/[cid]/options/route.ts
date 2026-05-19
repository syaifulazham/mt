import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string; cid: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { cid: criterionId } = await params;
  const body = await req.json();

  if (!body.label?.trim())
    return NextResponse.json({ error: "MISSING_LABEL" }, { status: 400 });

  const last = await db.judgingOption.findFirst({
    where: { criterionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const option = await db.judgingOption.create({
    data: {
      criterionId,
      label:  body.label.trim(),
      weight: body.weight != null ? Number(body.weight) : 0,
      order:  (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json({ option }, { status: 201 });
}
