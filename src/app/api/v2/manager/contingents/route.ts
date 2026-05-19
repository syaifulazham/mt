import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

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
