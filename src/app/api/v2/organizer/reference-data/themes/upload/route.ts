import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/svg+xml", "image/webp"];
const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "themes");

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

  const ext = extname(file.name) || ".png";
  const filename = `${randomUUID()}${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ url: `/uploads/themes/${filename}` }, { status: 201 });
}
