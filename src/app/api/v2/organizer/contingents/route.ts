import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const where = q
    ? {
        OR: [
          { name:      { contains: q, mode: "insensitive" as const } },
          { shortName: { contains: q, mode: "insensitive" as const } },
          { state:     { name: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [total, contingents] = await Promise.all([
    db.contingent.count({ where }),
    db.contingent.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:             true,
        name:           true,
        shortName:      true,
        contingentType: true,
        status:         true,
        createdAt:      true,
        state:          { select: { name: true, code: true } },
        _count: {
          select: {
            managers:     true,
            participants: true,
            teams:        true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({ total, page, pageSize, data: contingents });
}
