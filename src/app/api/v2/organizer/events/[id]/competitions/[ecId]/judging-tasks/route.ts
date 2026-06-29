import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PASSCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genSlug() { return randomBytes(10).toString("hex"); }
function genPasscode() {
  return Array.from({ length: 6 }, () => PASSCODE_CHARS[Math.floor(Math.random() * PASSCODE_CHARS.length)]).join("");
}

// GET — list judging tasks for this event competition
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const tasks = await db.judgingTask.findMany({
    where: { eventCompetitionId: ecId },
    include: { judgingTemplate: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ tasks });
}

// POST — create a judging task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId } = await params;
  const { judgingTemplateId, label } = await req.json().catch(() => ({}));
  if (!judgingTemplateId) return NextResponse.json({ error: "MISSING_TEMPLATE_ID" }, { status: 400 });

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Verify template is assigned to this event competition
  const assignment = await db.eventCompetitionJudgingTemplate.findUnique({
    where: { eventCompetitionId_judgingTemplateId: { eventCompetitionId: ecId, judgingTemplateId } },
  });
  if (!assignment) return NextResponse.json({ error: "TEMPLATE_NOT_ASSIGNED" }, { status: 400 });

  // Generate unique slug
  let routeSlug = genSlug();
  while (await db.judgingTask.findUnique({ where: { routeSlug } })) {
    routeSlug = genSlug();
  }

  const task = await db.judgingTask.create({
    data: { eventCompetitionId: ecId, judgingTemplateId, routeSlug, passcode: genPasscode(), label: label?.trim() || null },
    include: { judgingTemplate: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json({ task }, { status: 201 });
}
