import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string; cid: string; oid: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { oid } = await params;
  const body = await req.json();

  try {
    const option = await db.judgingOption.update({
      where: { id: oid },
      data: {
        ...(body.label  !== undefined && { label:  body.label?.trim() }),
        ...(body.weight !== undefined && { weight: Number(body.weight) }),
        ...(body.order  !== undefined && { order:  Number(body.order) }),
      },
    });
    return NextResponse.json({ option });
  } catch (e) {
    return NextResponse.json({ error: "UPDATE_FAILED", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { oid } = await params;
  try {
    await db.judgingOption.delete({ where: { id: oid } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: String(e) }, { status: 500 });
  }
}
