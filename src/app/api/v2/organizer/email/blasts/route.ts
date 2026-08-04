import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blasts = await db.emailBlast.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { recipients: true } },
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ blasts });
}

export async function POST(req: NextRequest) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const blast = await db.emailBlast.create({
    data: { title: title.trim(), createdById: user.id },
  });

  return NextResponse.json(blast, { status: 201 });
}
