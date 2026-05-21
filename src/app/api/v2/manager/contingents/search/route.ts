import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ data: [] });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const results = await db.contingent.findMany({
    where: {
      status: "ACTIVE",
      managers: { none: { managerId: manager.id } },
      OR: [
        { name:              { contains: q, mode: "insensitive" } },
        { school:            { name: { contains: q, mode: "insensitive" } } },
        { higherInstitution: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      school:            { select: { name: true } },
      higherInstitution: { select: { name: true } },
      _count:            { select: { managers: true } },
    },
    take: 10,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: results });
}
