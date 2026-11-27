import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ACCESS_MODES, getPajskAccess, normaliseEmails, setPajskAccess, type AccessMode } from "@/lib/pajsk/access";
import { getPajskSeason } from "@/lib/pajsk/entries";
import { pajskRulesSchema, savePajskRules } from "@/lib/pajsk/rules";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/** GET — PAJSK (Beta) access switch, the current season's rules, and the events on its issued certificates. */
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [access, season] = await Promise.all([getPajskAccess(), getPajskSeason()]);
  // Events as recorded on the season's issued participant certificates (eventId /
  // eventName are snapshot columns), with each one's distribution-level breakdown.
  const levelRows = season ? await db.$queryRaw<{ eventId: string; eventName: string | null; level: string; n: number }[]>`
    SELECT c."eventId", MAX(c."eventName") AS "eventName", COALESCE(c.meta->>'distLevel', 'NONE') AS level, COUNT(*)::int AS n
    FROM certificates c
    JOIN cert_template_versions v ON v.id = c."templateVersionId"
    JOIN cert_templates t          ON t.id = v."templateId"
    WHERE c."seasonId" = ${season.id} AND c.status = 'READY' AND c."recipientType" = 'PARTICIPANT'
      AND c."eventId" IS NOT NULL AND COALESCE(trim(c."competitionCode"), '') <> ''
      AND t."targetType"::text IN ('EVENT_PARTICIPANT', 'EVENT_WINNER', 'QUIZ_PARTICIPANT', 'QUIZ_WINNER', 'SCHOOL_WINNER', 'GENERAL')
    GROUP BY c."eventId", 3` : [];
  const events = new Map<string, { eventId: string; eventName: string; total: number; levels: Record<string, number> }>();
  for (const r of levelRows) {
    const e = events.get(r.eventId) ?? { eventId: r.eventId, eventName: r.eventName ?? r.eventId, total: 0, levels: {} };
    e.total += r.n;
    e.levels[r.level] = r.n;
    events.set(r.eventId, e);
  }

  const issued = season ? await db.pajskCertificate.groupBy({ by: ["status"], where: { seasonId: season.id }, _count: true }) : [];

  return NextResponse.json({
    access,
    season: season ? { id: season.id, year: season.year, name: season.name } : null,
    rules: season?.rules ?? null,
    events: [...events.values()].sort((a, b) => a.eventName.localeCompare(b.eventName)),
    issued: Object.fromEntries(issued.map(i => [i.status, i._count])),
    canWrite: WRITE_ROLES.includes(session.role),
  }, { headers: { "Cache-Control": "no-store" } });
}

/** PUT { access?: { mode, testerEmails }, rules?: PajskRules } — Super Admin / Admin. */
export async function PUT(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const by = session.name || session.email;

  const body = await req.json().catch(() => ({})) as { access?: { mode?: unknown; testerEmails?: unknown }; rules?: unknown };
  const out: Record<string, unknown> = {};

  if (body.rules !== undefined) {
    const season = await getPajskSeason();
    const parsed = pajskRulesSchema.safeParse(body.rules);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_RULES", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    if (season && parsed.data.year !== season.year)
      return NextResponse.json({ error: "YEAR_MISMATCH" }, { status: 400 });
    await savePajskRules(parsed.data);
    console.warn(`[pajsk] rules ${parsed.data.year} saved by ${by}`);
    out.rules = parsed.data;
  }

  if (body.access) {
    const patch: { mode?: AccessMode; testerEmails?: string[] } = {};
    if ((ACCESS_MODES as readonly unknown[]).includes(body.access.mode)) patch.mode = body.access.mode as AccessMode;
    if (body.access.testerEmails !== undefined) patch.testerEmails = normaliseEmails(body.access.testerEmails);
    out.access = await setPajskAccess(patch, by);
    console.warn(`[pajsk] access changed by ${by}: ${JSON.stringify({ mode: patch.mode, testers: patch.testerEmails?.length })}`);
  }

  if (!Object.keys(out).length) return NextResponse.json({ error: "NOTHING_TO_CHANGE" }, { status: 400 });
  return NextResponse.json(out);
}
