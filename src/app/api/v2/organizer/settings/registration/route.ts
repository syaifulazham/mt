import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { isRegistrationOpen, setRegistrationOpen } from "@/lib/registration";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ open: await isRegistrationOpen() });
}

export async function PATCH(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { open?: unknown } | null;
  if (typeof body?.open !== "boolean")
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  await setRegistrationOpen(body.open);
  return NextResponse.json({ open: body.open });
}
