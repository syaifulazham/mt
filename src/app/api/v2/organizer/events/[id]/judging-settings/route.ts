import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SHARED_RANK_MODES, type SharedRankMode } from "@/lib/sharedRank";

type Params = { params: Promise<{ id: string }> };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * PATCH { sharedRankMode } — Penghakiman → Tetapan global. The event-wide rule
 * for tied teams, read by the scoreboard, Keputusan, Pengumuman, medal tally
 * and certificate generation (src/lib/sharedRank.ts).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { sharedRankMode?: string };
  if (!SHARED_RANK_MODES.includes(body.sharedRankMode as SharedRankMode))
    return NextResponse.json({ error: "BAD_MODE", message: "Pilihan tidak sah." }, { status: 400 });

  const exists = await db.event.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const event = await db.event.update({
    where: { id },
    data: { sharedRankMode: body.sharedRankMode },
    select: { sharedRankMode: true },
  });
  return NextResponse.json(event);
}
