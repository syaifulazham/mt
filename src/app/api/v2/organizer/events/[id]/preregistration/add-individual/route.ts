import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import { eligibleCompetitions, loadPreregEvent, PARTICIPANT_SELECT, stateOf } from "@/lib/prereg-individual";

const WILDCARD_ROLES: string[] = ["SUPER_ADMIN"];

/**
 * POST { participantId, competitionId, wildcard? } — enter a participant in
 * one of the event's individual competitions (a team of one, PENDING), as
 * Tambah Pasukan / Wildcard do for teams.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;
  const body = (await req.json().catch(() => null)) as { participantId?: string; competitionId?: string; wildcard?: boolean } | null;
  if (!body?.participantId || !body.competitionId) return NextResponse.json({ error: "Pilih peserta dan pertandingan." }, { status: 400 });
  const wildcard = body.wildcard === true;
  if (wildcard && !WILDCARD_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const ev = await loadPreregEvent(eventId);
  if (!ev) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  const comp = ev.individual.find((c) => c.id === body.competitionId);
  if (!comp) return NextResponse.json({ error: "Pertandingan individu ini tidak ditawarkan dalam acara ini." }, { status: 400 });

  const p = await db.participant.findUnique({ where: { id: body.participantId }, select: PARTICIPANT_SELECT });
  if (!p?.contingent) return NextResponse.json({ error: "Peserta tidak ditemui." }, { status: 404 });
  if (!wildcard && !ev.inScope(stateOf(p)?.id ?? null))
    return NextResponse.json({ error: "Kontinjen peserta di luar negeri / zon acara ini. Gunakan Wildcard." }, { status: 400 });
  if (!eligibleCompetitions(ev, p).some((c) => c.id === comp.id))
    return NextResponse.json({ error: "Peserta tidak layak (kumpulan sasaran) untuk pertandingan ini." }, { status: 400 });

  const conflict = await singleParticipationConflict(db, { participantId: p.id, eventId, exceptCompetitionId: comp.id });
  if (conflict)
    return NextResponse.json({ error: `Acara ini membenarkan satu penyertaan sahaja — ${p.name} sudah didaftarkan dalam ${conflict}.` }, { status: 409 });

  const r = await db.$transaction(async (tx) => {
    const entry = await ensureIndividualEntry(tx, {
      participant: { id: p.id, name: p.name, contingentId: p.contingent!.id }, competitionId: comp.id, eventId,
    });
    if (entry.createdTeamEvent && wildcard) await tx.teamEvent.update({ where: { id: entry.teamEventId }, data: { wildcard: true } });
    return entry;
  });
  if (!r.createdTeamEvent) return NextResponse.json({ added: 0, skipped: 1, message: `${p.name} sudah didaftarkan dalam ${comp.code}.` });
  return NextResponse.json({ added: 1, skipped: 0, message: `${p.name} didaftarkan dalam ${comp.code} ${comp.name}.` });
}
