import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const stateId = searchParams.get("stateId") ?? undefined;
  const take = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const schools = await db.school.findMany({
    where: {
      isActive: true,
      ...(stateId ? { stateId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      level: true,
      category: true,
      state: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take,
  });

  return NextResponse.json({ data: schools });
}
