import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PASSCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genSlug() {
  return randomBytes(10).toString("hex");
}
function genPasscode() {
  return Array.from({ length: 6 }, () => PASSCODE_CHARS[Math.floor(Math.random() * PASSCODE_CHARS.length)]).join("");
}

// GET — list judging endpoints for this walk-in competition
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, wicId } = await params;
  const wic = await db.eventWalkInCompetition.findFirst({ where: { id: wicId, eventId } });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const endpoints = await db.walkInJudgingEndpoint.findMany({
    where: { walkInCompetitionId: wicId },
    select: {
      id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
      judgingTemplate: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: endpoints });
}

// POST — create a judging endpoint for one assigned template
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, wicId } = await params;
  const { judgingTemplateId, label } = await req.json().catch(() => ({}));
  if (!judgingTemplateId) return NextResponse.json({ error: "MISSING_TEMPLATE_ID" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findFirst({ where: { id: wicId, eventId } });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Verify template is assigned to this walk-in competition
  const assignment = await db.eventWalkInCompetitionJudgingTemplate.findUnique({
    where: { walkInCompetitionId_judgingTemplateId: { walkInCompetitionId: wicId, judgingTemplateId } },
  });
  if (!assignment) return NextResponse.json({ error: "TEMPLATE_NOT_ASSIGNED" }, { status: 400 });

  // Generate unique slug
  let routeSlug = genSlug();
  while (await db.walkInJudgingEndpoint.findUnique({ where: { routeSlug } })) {
    routeSlug = genSlug();
  }

  const endpoint = await db.walkInJudgingEndpoint.create({
    data: {
      eventId,
      walkInCompetitionId: wicId,
      judgingTemplateId,
      routeSlug,
      passcode: genPasscode(),
      label: label?.trim() || null,
    },
    select: {
      id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
      judgingTemplate: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
