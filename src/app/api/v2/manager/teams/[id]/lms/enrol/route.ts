import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function emailToUsername(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
    .padEnd(3, "x");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_API_KEY not found" }, { status: 503 });

  const { id } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({
    where: { id },
    include: { competition: { select: { eptimEduCourseId: true } } },
  });
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!team.lmsUserId)
    return NextResponse.json({ error: "Team has no LMS account. Join Bengkel first." }, { status: 400 });
  if (!team.email)
    return NextResponse.json({ error: "Team has no email address." }, { status: 400 });
  if (!team.competition.eptimEduCourseId)
    return NextResponse.json({ error: "No course attached to this competition." }, { status: 400 });
  if (team.lmsCourseEnrolled)
    return NextResponse.json({ error: "ALREADY_ENROLLED" }, { status: 409 });

  const username = emailToUsername(team.email);

  try {
    await eptimEdu.enrol(username, team.competition.eptimEduCourseId);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status !== 409) {
      const msg = e instanceof Error ? e.message : "EptimEdu API error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    // 409 = already enrolled in EptimEdu — sync our flag and treat as success
  }

  await db.team.update({ where: { id }, data: { lmsCourseEnrolled: true } });
  return NextResponse.json({ ok: true });
}
