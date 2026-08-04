import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const blast = await db.emailBlast.findUnique({
    where: { id },
    include: { _count: { select: { recipients: true } } },
  });
  if (!blast) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(blast);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const blast = await db.emailBlast.update({
    where: { id },
    data: {
      ...(body.title         !== undefined && { title: body.title }),
      ...(body.subject       !== undefined && { subject: body.subject }),
      ...(body.htmlBody      !== undefined && { htmlBody: body.htmlBody }),
      ...(body.includeHeader !== undefined && { includeHeader: body.includeHeader }),
      ...(body.includeFooter !== undefined && { includeFooter: body.includeFooter }),
      ...(body.scheduledAt   !== undefined && { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }),
      ...(body.status        !== undefined && { status: body.status }),
    },
  });

  return NextResponse.json(blast);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.emailBlast.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
