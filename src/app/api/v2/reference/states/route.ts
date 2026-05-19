import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const states = await db.state.findMany({
    where: { country: { codeIso2: "MY" } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data: states });
}
