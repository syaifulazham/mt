import { NextRequest, NextResponse } from "next/server";
import { competitionTitle } from "@/lib/competition-split";
import { authDuelControl, findDuelControl } from "@/lib/duel-control";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

// GET — what the passcode screen shows (no passcode needed).
export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const ep = await findDuelControl(slug);
  if (!ep) return NextResponse.json({ error: "NOT_FOUND", message: "Pautan tidak wujud atau telah ditutup." }, { status: 404 });
  const ec = ep.eventCompetition;
  return NextResponse.json({ label: ep.label, eventName: ec.event.name, competition: { ...ec.competition, name: competitionTitle(ec.competition.name, ec.splitLabel) } });
}

// POST — check the passcode (header x-duel-passcode); returns what the replica page needs.
export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const a = await authDuelControl(req, slug);
  if ("res" in a) return a.res;
  const ec = a.ep.eventCompetition;
  return NextResponse.json({
    ok: true, label: a.ep.label, access: a.ep.access, role: a.who.role,
    event: ec.event, ecId: a.ep.eventCompetitionId, competition: ec.competition,
  });
}
