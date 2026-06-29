import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// PATCH — update label or status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string; taskId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId, taskId } = await params;
  const task = await db.judgingTask.findFirst({ where: { id: taskId, eventCompetitionId: ecId, eventCompetition: { eventId } } });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { label, status } = await req.json().catch(() => ({}));
  const updated = await db.judgingTask.update({
    where: { id: taskId },
    data: {
      ...(label  !== undefined && { label:  label?.trim() || null }),
      ...(status !== undefined && { status }),
    },
    include: { judgingTemplate: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json({ task: updated });
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string; taskId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId, taskId } = await params;
  const task = await db.judgingTask.findFirst({ where: { id: taskId, eventCompetitionId: ecId, eventCompetition: { eventId } } });
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.judgingTask.delete({ where: { id: taskId } });
  return NextResponse.json({ success: true });
}
