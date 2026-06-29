import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// GET /api/v2/organizer/events/[id]/competitions/[ecId]/judging-templates
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, ecId } = await params;

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const rows = await db.eventCompetitionJudgingTemplate.findMany({
    where: { eventCompetitionId: ecId },
    include: {
      judgingTemplate: {
        select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: rows.map(r => r.judgingTemplate) });
}

// POST /api/v2/organizer/events/[id]/competitions/[ecId]/judging-templates
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, ecId } = await params;
  const { judgingTemplateId } = await req.json();
  if (!judgingTemplateId) return NextResponse.json({ error: "MISSING_TEMPLATE_ID" }, { status: 400 });

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const template = await db.judgingTemplate.findUnique({ where: { id: judgingTemplateId } });
  if (!template) return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });

  try {
    await db.eventCompetitionJudgingTemplate.create({
      data: { eventCompetitionId: ecId, judgingTemplateId },
    });
  } catch {
    return NextResponse.json({ error: "ALREADY_ASSIGNED" }, { status: 409 });
  }

  return NextResponse.json({ success: true, template: { ...template, _count: { criterions: 0 } } }, { status: 201 });
}
