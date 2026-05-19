import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const take = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const institutions = await db.higherInstitution.findMany({
    where: {
      isActive: true,
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
      state: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take,
  });

  return NextResponse.json({ data: institutions });
}
