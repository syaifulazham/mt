import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const MAX_SIZE     = 2 * 1024 * 1024; // 2 MB
const ALLOWED      = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const UPLOAD_DIR   = join(process.cwd(), "public", "uploads", "contingents");

// ── POST /api/v2/manager/contingents/[id]/logo  ───────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const owns = manager.contingentManagers.some((cm) => cm.contingentId === id);
  if (!owns) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)                      return NextResponse.json({ error: "NO_FILE" },       { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
  if (file.size > MAX_SIZE)         return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

  const ext      = extname(file.name) || ".png";
  const filename = `${randomUUID()}${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));

  const logoUrl = `/uploads/contingents/${filename}`;

  await db.contingent.update({ where: { id }, data: { logoUrl } });

  return NextResponse.json({ url: logoUrl }, { status: 201 });
}
