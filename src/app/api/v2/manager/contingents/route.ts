import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: { where: { status: { in: ["ACTIVE", "PENDING"] } } },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  if (manager.contingentManagers.length > 0) {
    return NextResponse.json({ error: "ALREADY_IN_CONTINGENT" }, { status: 400 });
  }

  const { name, shortName, logoUrl, stateId } = await req.json() as {
    name?: string; shortName?: string; logoUrl?: string; stateId?: string;
  };
  if (!name?.trim()) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  let contingentType: string;
  const linkData: Record<string, string> = {};

  if (manager.schoolId) {
    contingentType = "SCHOOL";
    const existing = await db.contingent.findUnique({ where: { schoolId: manager.schoolId } });
    if (existing) {
      return NextResponse.json({ error: "SCHOOL_HAS_CONTINGENT", contingentId: existing.id }, { status: 409 });
    }
    linkData.schoolId = manager.schoolId;
  } else if (manager.higherInstitutionId) {
    contingentType = "HIGHER";
    linkData.higherInstitutionId = manager.higherInstitutionId;
  } else if (manager.institutionType === "INTERNATIONAL") {
    contingentType = "INTERNATIONAL";
    if (stateId) linkData.stateId = stateId;
  } else {
    contingentType = "INDEPENDENT";
    if (stateId) linkData.stateId = stateId;
  }

  const contingent = await db.contingent.create({
    data: {
      name:      name.trim(),
      shortName: shortName?.trim() || null,
      logoUrl:   logoUrl || "builtin:shield",
      contingentType: contingentType as "SCHOOL" | "HIGHER" | "INDEPENDENT" | "INTERNATIONAL",
      ...linkData,
      managers: {
        create: { managerId: manager.id, role: "OWNER", status: "ACTIVE" },
      },
    },
  });

  return NextResponse.json({ data: contingent }, { status: 201 });
}

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        include: {
          contingent: {
            include: {
              school:            { select: { name: true } },
              higherInstitution: { select: { name: true } },
              state:             { select: { id: true, name: true } },
              _count: { select: { participants: true, teams: true } },
              managers: {
                where: { status: { in: ["ACTIVE", "PENDING"] } },
                include: {
                  manager: { select: { id: true, name: true, email: true, phone: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingents = manager.contingentManagers.map((cm) => {
    const allManagers = cm.contingent.managers;
    return {
      ...cm.contingent,
      managerRole:   cm.role,
      managerStatus: cm.status,
      // All ACTIVE managers visible to everyone (to see the team)
      activeManagers: allManagers
        .filter((m) => m.status === "ACTIVE" && m.managerId !== manager.id)
        .map((m) => ({
          id:      m.managerId,
          name:    m.manager.name,
          email:   m.manager.email,
          phone:   m.manager.phone,
          role:    m.role,
        })),
      // Pending join requests only visible to OWNER
      pendingJoinRequests: cm.role === "OWNER"
        ? allManagers
            .filter((m) => m.status === "PENDING")
            .map((m) => ({
              id:             m.id,
              managerId:      m.managerId,
              createdAt:      m.createdAt,
              requestMessage: m.requestMessage,
              manager: {
                name:  m.manager.name,
                email: m.manager.email,
                phone: m.manager.phone,
              },
            }))
        : [],
      managers: undefined,
    };
  });

  return NextResponse.json({ data: contingents });
}
