import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Strip leading school-type abbreviations so "sk pantai" → "pantai"
const ABBREV_RE = /^(sjkc|sjkt|smka|sma|smk|sk|sm)\s+/i;

function normalizeQuery(q: string): string {
  return q.replace(ABBREV_RE, "").trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw     = searchParams.get("q")?.trim() ?? "";
  const q       = normalizeQuery(raw);
  const stateId = searchParams.get("stateId") ?? undefined;
  const take    = Math.min(Number(searchParams.get("limit") ?? 20), 100);

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
