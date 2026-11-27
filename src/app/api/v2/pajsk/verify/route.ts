import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maskName, normaliseCode, formatCode } from "@/lib/pajsk/code";
import { refreshRow, rowToEntry } from "@/lib/pajsk/entries";
import { placeLabel } from "@/lib/pajsk/rules";
import { clientIp, rateLimit } from "@/lib/pajsk/http";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * POST { code } — public PAJSK certificate verification.
 * Answers only what a printed certificate already shows, with the name masked
 * and no school or IC (PDPA: the recipients are minors). Rate-limited per IP.
 * POST rather than GET so codes stay out of access logs and caches.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`pajsk-verify:${clientIp(req)}`, 30, 10 * 60_000))
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: HEADERS });

  const body = await req.json().catch(() => ({})) as { code?: unknown };
  const code = normaliseCode(body.code);
  if (!code) return NextResponse.json({ result: "INVALID_FORMAT" }, { headers: HEADERS });

  const stored = await db.pajskCertificate.findUnique({ where: { code }, select: { id: true } });
  if (!stored) return NextResponse.json({ result: "NOT_FOUND" }, { headers: HEADERS });

  const fresh = await refreshRow(stored.id);
  if (!fresh?.rules) return NextResponse.json({ result: "NOT_FOUND" }, { headers: HEADERS });
  if (fresh.row.status !== "VALID")
    return NextResponse.json({ result: "WITHDRAWN", code: formatCode(code) }, { headers: HEADERS });

  const e = rowToEntry(fresh.rules, fresh.row);
  return NextResponse.json({
    result: "VALID",
    certificate: {
      code: formatCode(e.code),
      programme: fresh.rules.programme,
      year: fresh.rules.year,
      name: maskName(e.recipientName),
      competition: `${e.competitionCode} ${e.competitionName ?? ""}`.trim(),
      stage: e.stageLabel,
      achievement: e.placing ? [placeLabel(e.placing), e.medal ? `Pingat ${e.medal}` : null].filter(Boolean).join(" · ") : null,
      pelibatan: { label: fresh.rules.pelibatan.label, level: fresh.rules.pelibatan.level, marks: e.pelibatanMarks },
      pencapaian: e.pencapaianMarks != null ? { level: fresh.rules.pencapaian.level, marks: e.pencapaianMarks } : null,
      issuedAt: fresh.row.issuedAt,
    },
  }, { headers: HEADERS });
}
