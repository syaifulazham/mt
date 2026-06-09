import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  const where = {
    contingentId: id,
    ...(q && {
      OR: [
        { name:        { contains: q, mode: "insensitive" as const } },
        { ic:          { contains: q, mode: "insensitive" as const } },
        { email:       { contains: q, mode: "insensitive" as const } },
        { className:   { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, data] = await Promise.all([
    db.participant.count({ where }),
    db.participant.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:          true,
        name:        true,
        ic:          true,
        email:       true,
        phoneNumber: true,
        gender:      true,
        age:         true,
        eduLevel:    true,
        classGrade:  true,
        className:   true,
        status:      true,
        ppki:        true,
        createdAt:   true,
      },
    }),
  ]);

  return NextResponse.json({ total, page, pageSize, data });
}
