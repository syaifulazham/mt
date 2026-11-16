import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { VOTER_COOKIE, entryWithTally, parseLinks, tallySession } from "@/lib/voting";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function voterKeyOf(req: NextRequest) {
  const v = req.cookies.get(VOTER_COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

function withCookie(res: NextResponse, key: string) {
  res.cookies.set(VOTER_COOKIE, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: COOKIE_MAX_AGE, path: "/" });
  return res;
}

function ipHash(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
}

async function loadSession(slug: string) {
  return db.votingSession.findUnique({
    where: { routeSlug: slug },
    include: {
      entries: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      eventCompetition: {
        select: { splitLabel: true, competition: { select: { code: true, name: true } }, event: { select: { name: true } } },
      },
    },
  });
}

// GET /api/vote/[slug] — the public voting page's data: session, entries
// (with tallies only when showResults is on) and this voter's own scores.
export async function GET(req: NextRequest, { params }: P) {
  const { slug } = await params;
  const s = await loadSession(slug);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const key = voterKeyOf(req) ?? randomUUID();
  const mine = await db.votingBallot.findMany({ where: { sessionId: s.id, voterKey: key }, select: { entryId: true, score: true } });
  const tally = s.showResults ? await tallySession(s.id) : new Map();
  const ec = s.eventCompetition;
  const res = NextResponse.json({
    session: {
      label: s.label, description: s.description, minScore: s.minScore, maxScore: s.maxScore,
      status: s.status, showResults: s.showResults,
      event: ec.event.name, competition: { code: ec.competition.code, name: ec.competition.name, splitLabel: ec.splitLabel },
    },
    // Entries without a link have nothing to review, so the public never sees them.
    entries: s.entries.filter(e => parseLinks(e.links).length > 0).map(e => {
      const { teamId: _t, sortOrder: _o, votes, total: _sum, average, ...rest } = entryWithTally(e, tally);
      void _t; void _o; void _sum;
      return s.showResults ? { ...rest, votes, average } : rest;
    }),
    mine: Object.fromEntries(mine.map(m => [m.entryId, m.score])),
  }, { headers: { "Cache-Control": "no-store" } });
  return withCookie(res, key);
}

// POST /api/vote/[slug] — { entryId, score }. One ballot per entry per voter
// cookie; voting again replaces the score.
export async function POST(req: NextRequest, { params }: P) {
  const { slug } = await params;
  const s = await db.votingSession.findUnique({ where: { routeSlug: slug }, select: { id: true, status: true, minScore: true, maxScore: true } });
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (s.status !== "ACTIVE") return NextResponse.json({ error: "Undian telah ditutup" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < s.minScore || score > s.maxScore)
    return NextResponse.json({ error: `Skor mesti antara ${s.minScore} dan ${s.maxScore}` }, { status: 400 });
  const entry = typeof body.entryId === "string"
    ? await db.votingEntry.findFirst({ where: { id: body.entryId, sessionId: s.id }, select: { id: true, links: true } })
    : null;
  if (!entry || parseLinks(entry.links).length === 0) return NextResponse.json({ error: "Penyertaan tidak dijumpai" }, { status: 404 });

  const key = voterKeyOf(req) ?? randomUUID();
  await db.votingBallot.upsert({
    where: { entryId_voterKey: { entryId: entry.id, voterKey: key } },
    create: { entryId: entry.id, sessionId: s.id, voterKey: key, score, ipHash: ipHash(req) },
    update: { score, ipHash: ipHash(req) },
  });
  return withCookie(NextResponse.json({ ok: true, entryId: entry.id, score }), key);
}
