import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const WRITE_ROLES  = ["SUPER_ADMIN", "ADMIN"];
const MAX_SIZE     = 2 * 1024 * 1024;
const ALLOWED      = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const UPLOAD_DIR   = join(process.cwd(), "public", "uploads", "states");

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const state = await db.state.findUnique({ where: { id } });
  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)                        return NextResponse.json({ error: "NO_FILE" },        { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "INVALID_TYPE" },   { status: 400 });
  if (file.size > MAX_SIZE)         return NextResponse.json({ error: "FILE_TOO_LARGE" },  { status: 400 });

  const ext      = extname(file.name) || ".png";
  const filename = `${randomUUID()}${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));

  const flagUrl = `/uploads/states/${filename}`;
  await db.state.update({ where: { id }, data: { flagUrl } });

  return NextResponse.json({ url: flagUrl }, { status: 201 });
}
