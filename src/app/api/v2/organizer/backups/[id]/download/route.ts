import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
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
  if (record.status !== "completed")
    return NextResponse.json({ error: "Backup not ready" }, { status: 409 });
  if (!fs.existsSync(record.filepath))
    return NextResponse.json({ error: "File not found on disk" }, { status: 410 });

  const stat = fs.statSync(record.filepath);
  const nodeStream = fs.createReadStream(record.filepath);
  // Convert Node.js Readable to Web ReadableStream
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type":        "application/octet-stream",
      "Content-Disposition": `attachment; filename="${record.filename}"`,
      "Content-Length":      String(stat.size),
    },
  });
}
