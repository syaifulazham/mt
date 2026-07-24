import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const VALID_SECTIONS = ["geography", "target-groups", "themes"] as const;

function settingKey(section: string) {
  return `ref_lock:${section}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { section } = await params;
  const row = await db.appSetting.findUnique({ where: { key: settingKey(section) } });
  return NextResponse.json({ locked: row?.value === "true" });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { section } = await params;
  if (!VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number]))
    return NextResponse.json({ error: "INVALID_SECTION" }, { status: 400 });
  const { locked } = await req.json() as { locked: boolean };
  await db.appSetting.upsert({
    where:  { key: settingKey(section) },
    update: { value: locked ? "true" : "false" },
    create: { key: settingKey(section), value: locked ? "true" : "false" },
  });
  return NextResponse.json({ locked });
}
