import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const schoolSelect = {
  id: true, name: true, code: true, level: true, category: true, categoryShort: true, ppdCode: true,
  zone:     { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  state: {
    select: {
      id: true, name: true, code: true,
      zoneStates: { include: { zone: { select: { id: true, name: true } } }, take: 1 },
    },
  },
} as const;

const hiSelect = {
  id: true, name: true, code: true, heiType: true, sector: true,
  state: {
    select: {
      id: true, name: true, code: true,
      zoneStates: { include: { zone: { select: { id: true, name: true } } }, take: 1 },
    },
  },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contingent = await db.contingent.findUnique({
    where: { id },
    select: {
      id:             true,
      name:           true,
      shortName:      true,
      contingentType: true,
      locality:       true,
      status:         true,
      createdAt:      true,
      updatedAt:      true,
      state: {
        select: {
          id: true, name: true, code: true,
          zoneStates: { include: { zone: { select: { id: true, name: true } } }, take: 1 },
        },
      },
      zone:              { select: { id: true, name: true } },
      school:            { select: schoolSelect },
      higherInstitution: { select: hiSelect },
      managers: {
        orderBy: { role: "asc" },
        select: {
          id: true, role: true, status: true, createdAt: true,
          manager: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
      teams: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, status: true,
          competition: { select: { id: true, code: true, name: true, participationType: true } },
          _count: { select: { members: true } },
        },
      },
      _count: { select: { participants: true } },
    },
  });

  if (!contingent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stateName =
    contingent.school?.state?.name ??
    contingent.higherInstitution?.state?.name ??
    contingent.state?.name ??
    null;

  const stateCode =
    contingent.school?.state?.code ??
    contingent.higherInstitution?.state?.code ??
    contingent.state?.code ??
    null;

  const zoneName =
    contingent.school?.zone?.name ??
    contingent.school?.state?.zoneStates?.[0]?.zone?.name ??
    contingent.higherInstitution?.state?.zoneStates?.[0]?.zone?.name ??
    contingent.zone?.name ??
    contingent.state?.zoneStates?.[0]?.zone?.name ??
    null;

  return NextResponse.json({ ...contingent, stateName, stateCode, zoneName });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await db.contingent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Delete all children explicitly — DB-level cascades may not be applied on prod
    await db.$transaction(async (tx) => {
      const teams = await tx.team.findMany({ where: { contingentId: id }, select: { id: true } });
      const teamIds = teams.map((t) => t.id);

      if (teamIds.length) {
        await tx.teamMember.deleteMany({ where: { teamId: { in: teamIds } } });
        await tx.teamTrainer.deleteMany({ where: { teamId: { in: teamIds } } });
      }

      const participants = await tx.participant.findMany({ where: { contingentId: id }, select: { id: true } });
      const participantIds = participants.map((p) => p.id);
      if (participantIds.length) {
        await tx.participantSession.deleteMany({ where: { participantId: { in: participantIds } } });
      }

      await tx.team.deleteMany({ where: { contingentId: id } });
      await tx.contingentManager.deleteMany({ where: { contingentId: id } });
      await tx.participant.deleteMany({ where: { contingentId: id } });
      await tx.trainer.deleteMany({ where: { contingentId: id } });
      await tx.contingent.delete({ where: { id } });
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    console.error("[contingents DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await db.contingent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { schoolId, higherInstitutionId, clearInstitution, name, shortName } = body;

  const data: Record<string, unknown> = {};

  if (clearInstitution) {
    data.schoolId = null;
    data.higherInstitutionId = null;
  } else if (schoolId !== undefined) {
    data.schoolId = schoolId || null;
    data.higherInstitutionId = null;
    if (name) data.name = name;
  } else if (higherInstitutionId !== undefined) {
    data.higherInstitutionId = higherInstitutionId || null;
    data.schoolId = null;
    if (name) data.name = name;
  } else if ("shortName" in body) {
    data.shortName = shortName?.trim() || null;
  }

  const updated = await db.contingent.update({
    where: { id },
    data,
    select: {
      id: true, name: true, shortName: true, contingentType: true,
      school:            { select: schoolSelect },
      higherInstitution: { select: hiSelect },
    },
  });

  return NextResponse.json(updated);
}
