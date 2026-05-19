import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// ── GET — fetch full entity detail ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const id   = searchParams.get("id");

  if (!type || !id) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  try {
    const data = await fetchEntity(type, id);
    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e) }, { status: 500 });
  }
}

async function fetchEntity(type: string, id: string) {
  switch (type) {
    case "participant":
      return db.participant.findUnique({
        where: { id },
        include: {
          contingent: { select: { id: true, name: true, contingentType: true } },
          teamMembers: {
            include: {
              team: {
                select: {
                  id: true, name: true,
                  competition: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
        },
      });

    case "trainer":
      return db.trainer.findUnique({
        where: { id },
        include: {
          contingent: { select: { id: true, name: true, contingentType: true } },
          teams: {
            include: {
              team: {
                select: {
                  id: true, name: true,
                  competition: { select: { id: true, name: true, code: true } },
                  _count: { select: { members: true } },
                },
              },
            },
          },
        },
      });

    case "manager":
      return db.managerProfile.findUnique({
        where: { id },
        include: {
          school:            { select: { id: true, name: true, code: true } },
          higherInstitution: { select: { id: true, name: true } },
          contingentManagers: {
            include: {
              contingent: {
                select: {
                  id: true, name: true, contingentType: true,
                  _count: { select: { participants: true, teams: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

    case "contingent":
      return db.contingent.findUnique({
        where: { id },
        include: {
          school:            { select: { id: true, name: true, code: true } },
          higherInstitution: { select: { id: true, name: true } },
          state:             { select: { id: true, name: true } },
          zone:              { select: { id: true, name: true } },
          managers: {
            where: { status: "ACTIVE" },
            include: { manager: { select: { id: true, name: true, email: true } } },
            take: 10,
          },
          _count: { select: { participants: true, teams: true, managers: true, trainers: true } },
        },
      });

    case "school":
      return db.school.findUnique({
        where: { id },
        include: {
          state:    { select: { id: true, name: true } },
          zone:     { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
          _count:   { select: { contingents: true } },
        },
      });

    case "team":
      return db.team.findUnique({
        where: { id },
        include: {
          competition: { select: { id: true, name: true, code: true, participationType: true } },
          contingent:  { select: { id: true, name: true } },
          members: {
            include: {
              participant: { select: { id: true, name: true, ic: true, gender: true } },
            },
          },
          trainers: {
            include: {
              trainer: { select: { id: true, name: true } },
            },
          },
          _count: { select: { members: true } },
        },
      });

    case "event":
      return db.event.findUnique({
        where: { id },
        include: {
          state: { select: { id: true, name: true } },
          zone:  { select: { id: true, name: true } },
          eventCompetitions: {
            include: {
              competition: { select: { id: true, name: true, code: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { eventCompetitions: true } },
        },
      });

    default:
      return null;
  }
}

// ── PATCH — update entity ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const id   = searchParams.get("id");

  if (!type || !id) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  const body = await req.json();

  try {
    let data: unknown;

    if (type === "participant") {
      data = await db.participant.update({
        where: { id },
        data: {
          ...(body.name        !== undefined && { name:       body.name?.trim() || undefined }),
          ...(body.gender      !== undefined && { gender:     body.gender      || undefined }),
          ...(body.age         !== undefined && { age:        body.age != null ? Number(body.age) : null }),
          ...(body.eduLevel    !== undefined && { eduLevel:   body.eduLevel    || undefined }),
          ...(body.classGrade  !== undefined && { classGrade: body.classGrade?.trim() || null }),
          ...(body.className   !== undefined && { className:  body.className?.trim()  || null }),
          ...(body.status      !== undefined && { status:     body.status      || undefined }),
        },
      });

    } else if (type === "trainer") {
      data = await db.trainer.update({
        where: { id },
        data: {
          ...(body.name        !== undefined && { name:        body.name?.trim() || undefined }),
          ...(body.email       !== undefined && { email:       body.email?.trim() || null }),
          ...(body.phoneNumber !== undefined && { phoneNumber: body.phoneNumber?.trim() || null }),
          ...(body.status      !== undefined && { status:      body.status || undefined }),
        },
      });

    } else if (type === "contingent") {
      data = await db.contingent.update({
        where: { id },
        data: {
          ...(body.name           !== undefined && { name:           body.name?.trim()           || undefined }),
          ...(body.shortName      !== undefined && { shortName:      body.shortName?.trim()      || null }),
          ...(body.contingentType !== undefined && { contingentType: body.contingentType         || undefined }),
          ...(body.status         !== undefined && { status:         body.status                 || undefined }),
        },
      });
    } else {
      return NextResponse.json({ error: "UPDATE_NOT_SUPPORTED" }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: "UPDATE_FAILED", detail: String(e) }, { status: 500 });
  }
}

// ── DELETE — remove entity ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const id   = searchParams.get("id");

  if (!type || !id) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  try {
    if (type === "participant") {
      await db.participant.delete({ where: { id } });
    } else if (type === "trainer") {
      await db.trainer.delete({ where: { id } });
    } else {
      return NextResponse.json({ error: "DELETE_NOT_SUPPORTED" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: String(e) }, { status: 500 });
  }
}
