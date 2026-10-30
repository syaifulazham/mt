import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { vibeBlocksConfigured, vibeBlocksQueryAllResults, vibeBlocksErrorMessage, parseVibeBlocksToken, type VibeBlocksError } from "@/lib/vibeblocks";

// GET /api/v2/organizer/events/[id]/walkin/[wicId]/vibeblocks-results
// Queries VibeBlocks for results of all registered entries in this walk-in competition.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!vibeBlocksConfigured())
    return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED", message: "VibeBlocks API tidak dikonfigurasi." }, { status: 400 });

  const { id, wicId } = await params;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    select: {
      eventId: true,
      viblockChallengeId: true,
      registrations: {
        where: { viblockToken: { not: null } },
        select: {
          id: true, viblockToken: true, sessionNumber: true, slotNumber: true,
          participant: { select: { name: true, eduLevel: true, classGrade: true } },
          contingent:  { select: { name: true, shortName: true } },
        },
      },
    },
  });
  if (!wic || wic.eventId !== id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!wic.viblockChallengeId)
    return NextResponse.json({ error: "NO_EVENT_CREATED", message: "Acara VibeBlocks belum dicipta." }, { status: 400 });

  // Map entryId -> registration
  const byEntryId = new Map<string, (typeof wic.registrations)[number]>();
  for (const r of wic.registrations) {
    const parsed = r.viblockToken ? parseVibeBlocksToken(r.viblockToken) : null;
    if (parsed) byEntryId.set(parsed.entryId, r);
  }
  const entryIds = [...byEntryId.keys()];
  if (entryIds.length === 0) return NextResponse.json({ data: [], missing: [] });

  try {
    // One query for every entry: VibeBlocks ranks only within the IDs sent
    // together, so splitting them would restart the ranking in each batch.
    const res = await vibeBlocksQueryAllResults(wic.viblockChallengeId, entryIds);
    const results = res.results;
    const missing = res.missing_entry_ids;

    const data = results
      .map(r => {
        const reg = byEntryId.get(r.entry_id);
        return {
          entryId:             r.entry_id,
          rank:                r.rank,
          status:              r.status,
          completedStageCount: r.completed_stage_count,
          officialElapsedMs:   r.official_elapsed_ms,
          isUsed:              r.is_used,
          consumedAt:          r.consumed_at,
          registrationId:      reg?.id ?? null,
          sessionNumber:       reg?.sessionNumber ?? null,
          slotNumber:          reg?.slotNumber ?? null,
          participant:         reg?.participant ?? null,
          contingent:          reg?.contingent ?? null,
        };
      })
      .sort((a, b) => {
        if (a.rank != null && b.rank != null) return a.rank - b.rank;
        if (a.rank != null) return -1;
        if (b.rank != null) return 1;
        return (a.participant?.name ?? "").localeCompare(b.participant?.name ?? "");
      });

    return NextResponse.json({ data, missing: missing.map(id => byEntryId.get(id)?.participant.name ?? id) });
  } catch (e: unknown) {
    const err = e as VibeBlocksError;
    console.error("[vibeblocks] results query failed:", err.message, "status:", err.status, "code:", err.code);
    return NextResponse.json({ error: err.code ?? "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e) }, { status: 502 });
  }
}
