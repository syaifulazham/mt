import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FIXED_KEYS, LAYOUT_SETTING_KEY, layoutSchema, parseLayout, resolveOrder, LANDING_WRITE_ROLES as WRITE_ROLES } from "@/lib/landingSections";

async function current() {
  const [setting, sections] = await Promise.all([
    db.appSetting.findUnique({ where: { key: LAYOUT_SETTING_KEY } }),
    db.landingSection.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  const layout = parseLayout(setting?.value);
  return { order: resolveOrder(layout, sections.map((s) => s.id)), hidden: layout.hidden };
}

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ data: await current() });
}

export async function PUT(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = layoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid layout" }, { status: 400 });

  // Only fixed sections can be hidden; custom ones use their Published switch.
  const fixed = new Set(FIXED_KEYS.map((k) => `fixed:${k}`));
  const value = JSON.stringify({
    order: parsed.data.order,
    hidden: parsed.data.hidden.filter((k) => fixed.has(k)),
  });
  await db.appSetting.upsert({
    where: { key: LAYOUT_SETTING_KEY },
    create: { key: LAYOUT_SETTING_KEY, value },
    update: { value },
  });
  return NextResponse.json({ data: await current() });
}
