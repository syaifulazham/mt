import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/walkin-judging/[slug]/scores
// Body: { passcode, walkInRegistrationId, criterionId, score?, timeSeconds?, optionIds? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const { passcode, walkInRegistrationId, criterionId, score, timeSeconds, optionIds } = body as {
    passcode: string;
    walkInRegistrationId: string;
    criterionId: string;
    score?: number | null;
    timeSeconds?: number | null;
    optionIds?: string[];
  };

  if (!passcode || !walkInRegistrationId || !criterionId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const endpoint = await db.walkInJudgingEndpoint.findUnique({ where: { routeSlug: slug } });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });
  if (endpoint.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });

  // Ensure the registration belongs to this endpoint's walk-in competition
  const registration = await db.walkInRegistration.findFirst({
    where: { id: walkInRegistrationId, walkInCompetitionId: endpoint.walkInCompetitionId, status: "CONFIRMED" },
  });
  if (!registration) return NextResponse.json({ error: "REGISTRATION_NOT_FOUND" }, { status: 404 });

  const saved = await db.walkInJudgingScore.upsert({
    where: {
      walkInJudgingEndpointId_walkInRegistrationId_criterionId: {
        walkInJudgingEndpointId: endpoint.id,
        walkInRegistrationId,
        criterionId,
      },
    },
    create: {
      walkInJudgingEndpointId: endpoint.id,
      walkInRegistrationId,
      criterionId,
      score: score ?? null,
      timeSeconds: timeSeconds ?? null,
      optionIds: optionIds ?? [],
    },
    update: {
      score: score ?? null,
      timeSeconds: timeSeconds ?? null,
      optionIds: optionIds ?? [],
    },
  });

  return NextResponse.json(saved);
}
