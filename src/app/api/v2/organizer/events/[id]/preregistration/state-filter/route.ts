import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

function settingKey(eventId: string) {
  return `event_prereq_state_filter:${eventId}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const setting = await db.appSetting.findUnique({ where: { key: settingKey(eventId) } });
  const stateIds: string[] = setting ? (JSON.parse(setting.value) as string[]) : [];
  return NextResponse.json({ stateIds });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as { stateIds?: unknown };
  const stateIds: string[] = Array.isArray(body.stateIds)
    ? (body.stateIds as string[]).filter((s) => typeof s === "string")
    : [];

  await db.appSetting.upsert({
    where:  { key: settingKey(eventId) },
    update: { value: JSON.stringify(stateIds) },
    create: { key: settingKey(eventId), value: JSON.stringify(stateIds) },
  });

  return NextResponse.json({ stateIds });
}
