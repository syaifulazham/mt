import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getOrganizerSession } from "@/lib/auth/session";
import { backupDb } from "@/lib/backup-db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const record = backupDb.get(id);
  if (!record) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: { ...record, filepath: undefined } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const record = backupDb.get(id);
  if (!record) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (record.status === "running")
    return NextResponse.json({ error: "Cannot delete a running backup" }, { status: 409 });

  try {
    if (fs.existsSync(record.filepath)) fs.unlinkSync(record.filepath);
  } catch { /* ignore if already gone */ }

  backupDb.delete(id);
  return NextResponse.json({ ok: true });
}
