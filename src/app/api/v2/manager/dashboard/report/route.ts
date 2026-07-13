import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// GET — full team roster for this manager, sorted by competition code, for report download
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: { select: { contingentId: true } },
      school:             { select: { name: true } },
      higherInstitution:  { select: { name: true } },
    },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: [], contingentName: "" });

  // Single contingent name for the report header
  const contingent = await db.contingent.findFirst({
    where: { id: { in: contingentIds } },
    select: { name: true },
  });

  const teams = await db.team.findMany({
    where: { contingentId: { in: contingentIds } },
    include: {
      competition: { select: { id: true, code: true, name: true, minTeamSize: true, maxTeamSize: true } },
      contingent:  { select: { name: true } },
      members: {
        include: {
          participant: {
            select: { id: true, name: true, ic: true, gender: true, eduLevel: true, classGrade: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      trainers: {
        include: {
          trainer: { select: { id: true, name: true, phoneNumber: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ competition: { code: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    contingentName: contingent?.name ?? manager.name,
    data: teams.map((t) => ({
      id:              t.id,
      name:            t.name,
      contingentName:  t.contingent?.name ?? "",
      competitionCode: t.competition.code,
      competitionName: t.competition.name,
      minTeamSize:     t.competition.minTeamSize,
      maxTeamSize:     t.competition.maxTeamSize,
      members: t.members.map((m) => ({
        name:       m.participant.name,
        ic:         m.participant.ic ?? "",
        gender:     m.participant.gender,
        eduLevel:   m.participant.eduLevel,
        classGrade: m.participant.classGrade ?? "",
      })),
      trainers: t.trainers.map((tr) => ({
        name:        tr.trainer.name,
        phoneNumber: tr.trainer.phoneNumber ?? "",
        email:       tr.trainer.email ?? "",
      })),
    })),
  });
}
