import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const folder = req.nextUrl.searchParams.get("folder") || null;
  const q      = req.nextUrl.searchParams.get("q")      || null;

  const items = await db.knowledgeBase.findMany({
    where: {
      ...(folder && { path: { startsWith: folder + "/" } }),
      ...(q      && {
        OR: [
          { title:   { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    select: { id: true, path: true, title: true, entityType: true, entityId: true, updatedAt: true },
    orderBy: { path: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { path, title, content } = await req.json();
  if (!path?.trim() || !title?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const item = await db.knowledgeBase.create({
      data: { path: path.trim(), title: title.trim(), content: content ?? "" },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "CREATE_FAILED", detail: String(e) }, { status: 500 });
  }
}
