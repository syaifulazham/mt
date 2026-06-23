import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// POST { ics: string[] } — returns { existing: string[] }
// ics must be digits-only (12 chars). Returns which ones are already in contestants.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json() as { ics?: string[] };
  const ics  = (body.ics ?? []).filter(s => typeof s === "string" && s.length === 12);
  if (ics.length === 0) return NextResponse.json({ existing: [] });

  try {
    const rows = await db.$queryRaw<{ ic: string }[]>`
      SELECT ic
      FROM   contestants
      WHERE  ic IS NOT NULL
        AND  REGEXP_REPLACE(ic, '[^0-9]', '', 'g') = ANY(${ics}::text[])
    `;
    const existing = rows
      .map(r => (r.ic ?? "").replace(/\D/g, ""))
      .filter(s => s.length === 12);
    return NextResponse.json({ existing });
  } catch (err) {
    console.error("[check-ics]", err);
    return NextResponse.json({ existing: [] });
  }
}
