import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { csiConfigured, csiResetAttempt } from "@/lib/eptim-csi";

/**
 * POST — give a team a fresh start on one Eptim CSI case (Super Admin / Admin).
 * Body: { ecId, teamId, caseId, reason? }. The CSI competition, the case and
 * the player all come from MT's records — never from the request — so a reset
 * can only target a configured case of this event and a team entered in it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!csiConfigured()) return NextResponse.json({ error: "Eptim CSI belum dikonfigurasi." }, { status: 503 });

  const { id: eventId } = await params;
  const { ecId, teamId, caseId, reason } = await req.json().catch(() => ({})) as
    { ecId?: string; teamId?: string; caseId?: string; reason?: string };
  if (!ecId || !teamId || !caseId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const ec = await db.eventCompetition.findFirst({
    where:  { id: ecId, eventId, eptimCsiCompetitionId: { not: null } },
    select: { competitionId: true, eptimCsiCompetitionId: true, eptimCsiCases: true },
  });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const cases = (ec.eptimCsiCases as { id: string; title: string }[] | null) ?? [];
  if (!cases.some(c => c.id === caseId)) return NextResponse.json({ error: "CASE_NOT_CONFIGURED" }, { status: 409 });

  const team = await db.team.findFirst({
    where:  { id: teamId, competitionId: ec.competitionId, teamEvents: { some: { eventId } } },
    select: { name: true, csiAccess: { select: { csiUserId: true } } },
  });
  if (!team) return NextResponse.json({ error: "TEAM_NOT_FOUND" }, { status: 404 });
  if (!team.csiAccess) return NextResponse.json({ error: "Pasukan ini tiada akaun Eptim CSI." }, { status: 409 });

  const by = `MT ${session.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}: ${session.name || session.email}`;
  try {
    const r = await csiResetAttempt(ec.eptimCsiCompetitionId!, {
      userId: team.csiAccess.csiUserId, caseId, by, reason: reason?.trim() || undefined,
    });
    console.info(`[eptim-csi] reset team ${teamId} (${team.name}) case ${caseId} by ${by}: voided ${r.voided}`);
    return NextResponse.json({ ok: true, voided: r.voided });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    // An older CSI has no /resets route: its 404 is an HTML page, which fails JSON parsing
    const msg = e instanceof SyntaxError
      ? "Eptim CSI belum menyokong set semula percubaan (perlu dikemas kini)."
      : (err.message ?? "Sambungan ke Eptim CSI gagal.");
    return NextResponse.json({ error: msg }, { status: err.status ?? 502 });
  }
}
