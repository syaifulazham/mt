import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q        = searchParams.get("q") ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where = q
    ? { OR: [
        { name:        { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
      ]}
    : {};

  try {
    const [data, total] = await Promise.all([
      db.theme.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.theme.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  } catch (e: unknown) {
    if (e instanceof TypeError && String(e.message).includes("undefined")) {
      return NextResponse.json(
        { error: "RESTART_REQUIRED", message: "Prisma client is stale. Stop the dev server and run `npm run dev` again." },
        { status: 503 }
      );
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, color, logoUrl, description } = await req.json();
  if (!name?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const theme = await db.theme.create({
      data: {
        name:        name.trim(),
        color:       color?.trim()       || undefined,
        logoUrl:     logoUrl?.trim()     || undefined,
        description: description?.trim() || undefined,
      },
    });
    return NextResponse.json({ data: theme }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "NAME_TAKEN" }, { status: 409 });
    throw e; // any other DB error → 500, not silently masked as NAME_TAKEN
  }
}
