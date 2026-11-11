import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { linkPlan, saveLinks } from "@/lib/certificates/pregen";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
type Params = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!WRITE_ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const job = await db.certGeneratorJob.findUnique({ where: { id }, select: { id: true, templateId: true, source: true, config: true } });
  if (!job) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  if (job.source !== "EVENT_WINNERS_PREGEN") return { res: NextResponse.json({ error: "NOT_PREGEN", message: "Bukan penjana sijil pra-acara." }, { status: 400 }) };
  return { session, job };
}

/** GET — pre-event blanks of this generator and the event's winners, with the proposed linking. */
export async function GET(_req: NextRequest, { params }: Params) {
  const g = await guard((await params).id);
  if ("res" in g) return g.res;
  try {
    return NextResponse.json(await linkPlan(g.job));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal" }, { status: 500 });
  }
}

/** POST { mapping: { [winnerKey]: certId | null } } — tie the winners to the blanks (null = new certificate). */
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard((await params).id);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({})) as { mapping?: Record<string, string | null> };
  try {
    const summary = await saveLinks(g.job, body.mapping ?? {}, { id: g.session.id, name: g.session.name || g.session.email });
    console.warn(`[certificates] ${g.session.name || g.session.email} linked pre-event certificates (job ${g.job.id}): ${JSON.stringify(summary)}`);
    return NextResponse.json({ summary, ...(await linkPlan(g.job)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal" }, { status: 400 });
  }
}
