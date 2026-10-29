import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { LANDING_WRITE_ROLES as WRITE_ROLES, sectionInputSchema, toSectionDto , isBackdropActive } from "@/lib/landingSections";



export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const rows = await db.landingSection.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ data: rows.map(toSectionDto) });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = sectionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid section" }, { status: 400 });
  const d = parsed.data;

  const row = await db.landingSection.create({
    data: {
      title: d.title,
      eyebrow: d.eyebrow || null,
      navLabel: d.navLabel || null,
      background: d.background,
      backdrop: isBackdropActive(d.backdrop) ? d.backdrop : Prisma.DbNull,
      blocks: d.blocks,
      isPublished: d.isPublished ?? false,
    },
  });
  return NextResponse.json({ data: toSectionDto(row) }, { status: 201 });
}
