import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { LAYOUT_SETTING_KEY, parseLayout, sectionInputSchema, toSectionDto, LANDING_WRITE_ROLES as WRITE_ROLES , isBackdropActive } from "@/lib/landingSections";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const row = await db.landingSection.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: toSectionDto(row) });
}

/** Full update, or `{ isPublished }` alone to publish / unpublish. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const exists = await db.landingSection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (body && typeof body === "object" && Object.keys(body).length === 1 && typeof body.isPublished === "boolean") {
    const row = await db.landingSection.update({ where: { id }, data: { isPublished: body.isPublished } });
    return NextResponse.json({ data: toSectionDto(row) });
  }

  const parsed = sectionInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid section" }, { status: 400 });
  const d = parsed.data;
  const row = await db.landingSection.update({
    where: { id },
    data: {
      title: d.title,
      eyebrow: d.eyebrow || null,
      navLabel: d.navLabel || null,
      background: d.background,
      backdrop: isBackdropActive(d.backdrop) ? d.backdrop : Prisma.DbNull,
      blocks: d.blocks,
      ...(d.isPublished !== undefined ? { isPublished: d.isPublished } : {}),
    },
  });
  return NextResponse.json({ data: toSectionDto(row) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  await db.$transaction(async (tx) => {
    await tx.landingSection.delete({ where: { id } });
    // Drop it from the saved page order too.
    const setting = await tx.appSetting.findUnique({ where: { key: LAYOUT_SETTING_KEY } });
    if (setting) {
      const layout = parseLayout(setting.value);
      const key = `custom:${id}`;
      await tx.appSetting.update({
        where: { key: LAYOUT_SETTING_KEY },
        data: { value: JSON.stringify({ order: layout.order.filter((k) => k !== key), hidden: layout.hidden.filter((k) => k !== key) }) },
      });
    }
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
