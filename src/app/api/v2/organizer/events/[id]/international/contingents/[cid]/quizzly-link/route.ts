import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentInternationalLink } from "@/lib/international-link";
import { loadForeignContingent, requireInternationalAdmin } from "@/lib/international";
import { organizerQuizzlyLink } from "@/lib/quizzly-link";

type Params = { params: Promise<{ id: string; cid: string }> };

/**
 * POST { participantId, competitionId, regenerate? } — the participant's Asia
 * Spark quiz link for this event's competition: the stored one, or a newly
 * issued code with `regenerate`. Organizers only (not mirrored for
 * registration links), and only for a participant entered in that competition.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  if (currentInternationalLink()) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => null) as { participantId?: string; competitionId?: string; regenerate?: boolean } | null;
  if (!body?.participantId || !body.competitionId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const entered = await db.teamEvent.findFirst({
    where: {
      eventId,
      team: { contingentId: cid, competitionId: body.competitionId, members: { some: { participantId: body.participantId } } },
    },
    select: { id: true },
  });
  if (!entered) return NextResponse.json({ error: "Peserta belum didaftarkan dalam pertandingan ini." }, { status: 409 });

  const r = await organizerQuizzlyLink({
    eventId, competitionId: body.competitionId, participantId: body.participantId, regenerate: !!body.regenerate,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.link });
}
