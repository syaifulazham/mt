import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const templates = await db.judgingTemplate.findMany({
    include: { _count: { select: { criterions: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, code, description } = await req.json();
  if (!name?.trim() || !code?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const template = await db.judgingTemplate.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), description: description?.trim() || null },
      include: { _count: { select: { criterions: true } } },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (e) {
    const msg = String(e);
    return NextResponse.json(
      { error: msg.includes("Unique") ? "CODE_TAKEN" : "CREATE_FAILED" },
      { status: 400 }
    );
  }
}
