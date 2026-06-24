import { NextRequest, NextResponse } from "next/server";
import { truncateSync, existsSync } from "fs";
import { getOrganizerSession } from "@/lib/auth/session";
import { readLogs, logInfo, logFilePath, type LogLevel } from "@/lib/appLogger";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const level = (searchParams.get("level") ?? undefined) as LogLevel | undefined;
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10)));
    const data  = readLogs(limit, level);
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json({ error: "READ_FAILED", detail: String(e) }, { status: 422 });
  }
}

/** DELETE — clear the log file */
export async function DELETE(_req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const path = logFilePath();
    if (existsSync(path)) truncateSync(path, 0);
    logInfo("system", "Error log cleared", session.name);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "CLEAR_FAILED", detail: String(e) }, { status: 422 });
  }
}
