import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getCertDistribution, setCertDistribution } from "@/lib/certificates/distribution";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/** GET — the two distribution switches, plus counts of what each portal would offer. */
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [settings, ready, withParticipant, withContingent] = await Promise.all([
    getCertDistribution(),
    db.certificate.count({ where: { status: "READY" } }),
    db.certificate.count({ where: { status: "READY", participantId: { not: null } } }),
    db.certificate.count({ where: { status: "READY", contingentId: { not: null } } }),
  ]);
  return NextResponse.json(
    { settings, counts: { ready, withParticipant, withContingent }, canWrite: WRITE_ROLES.includes(session.role) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH { manager?: boolean, participant?: boolean } — Super Admin / Admin. */
export async function PATCH(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { manager?: unknown; participant?: unknown };
  const patch: { manager?: boolean; participant?: boolean } = {};
  if (typeof body.manager === "boolean") patch.manager = body.manager;
  if (typeof body.participant === "boolean") patch.participant = body.participant;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "NOTHING_TO_CHANGE" }, { status: 400 });

  const settings = await setCertDistribution(patch, session.name || session.email);
  console.warn(`[certificates] distribution changed by ${session.name || session.email}: ${JSON.stringify(patch)}`);
  return NextResponse.json({ settings });
}
