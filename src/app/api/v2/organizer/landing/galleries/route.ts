import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const galleries = await db.gallery.findMany({
    orderBy: [{ year: "desc" }, { title: "asc" }],
    include: { photos: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(galleries);
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { title, year, description } = await req.json();
  if (!title?.trim() || !year) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const gallery = await db.gallery.create({
    data: { title: title.trim(), year: Number(year), description: description?.trim() || null },
    include: { photos: true },
  });

  return NextResponse.json(gallery, { status: 201 });
}
