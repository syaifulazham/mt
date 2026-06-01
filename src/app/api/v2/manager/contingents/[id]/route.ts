import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

async function resolveContingent(userId: string, contingentId: string) {
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true, role: true, status: true } } },
  });
  if (!manager) return { error: "PROFILE_NOT_FOUND", status: 404 } as const;

  const link = manager.contingentManagers.find((cm) => cm.contingentId === contingentId);
  if (!link) return { error: "FORBIDDEN", status: 403 } as const;
  if (link.status !== "ACTIVE") return { error: "PENDING_APPROVAL", status: 403 } as const;

  return { managerId: manager.id, role: link.role };
}

// ── PATCH /api/v2/manager/contingents/[id]  ───────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const result = await resolveContingent(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json();
  const { name, shortName, logoUrl, stateId, locality } = body;

  if (name !== undefined && !name.trim())
    return NextResponse.json({ error: "NAME_EMPTY" }, { status: 400 });

  const updated = await db.contingent.update({
    where: { id },
    data: {
      ...(name      !== undefined && { name:      name.trim()           }),
      ...(shortName !== undefined && { shortName: shortName?.trim() || null }),
      ...(logoUrl   !== undefined && { logoUrl:   logoUrl || null       }),
      ...(stateId   !== undefined && { stateId:   stateId || null       }),
      ...(locality  !== undefined && { locality:  locality || null      }),
    },
    include: {
      school:            { select: { name: true } },
      higherInstitution: { select: { name: true } },
      state:             { select: { id: true, name: true } },
      _count: { select: { participants: true, teams: true } },
    },
  });

  return NextResponse.json({ data: updated });
}
