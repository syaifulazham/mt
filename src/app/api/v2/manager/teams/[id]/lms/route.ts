import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function randomPassword(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// EptimEdu username: alphanumeric + _ + - only, min 3, max 40
// email → "user_at_example_com"
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const team = await db.team.findUnique({ where: { id }, select: { contingentId: true, lmsUserId: true, email: true } });
  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (!contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (!team.lmsUserId || !team.email) return NextResponse.json({ data: null });

  try {
    const username = emailToUsername(team.email);
    const result = await eptimEdu.userExists(username);
    const user = result?.user ?? null;
    return NextResponse.json({
      data: user
        ? { loginCount: user.loginCount ?? 0, lastLoginAt: user.lastLoginAt ?? null }
        : null,
    });
  } catch {
    return NextResponse.json({ data: null });
  }
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
    include: { competition: { select: { id: true, eptimEduCourseId: true } } },
  });
  if (!team)                            return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!contingentIds.includes(team.contingentId))
                                        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!team.email)
    return NextResponse.json({ error: "Team email is not set. Set an email before joining Bengkel MT." }, { status: 400 });
  if (team.lmsUserId)
    return NextResponse.json({ error: "ALREADY_ENROLLED" }, { status: 409 });

  const username = emailToUsername(team.email);
  const password = randomPassword(6);

  try {
    let lmsUserId: string;
    let enrolled = false;

    if (team.competition.eptimEduCourseId) {
      // enrol() auto-provisions the user if the account doesn't exist yet.
      // Response includes userId which we store as the LMS account reference.
      const result = await eptimEdu.enrol(username, team.competition.eptimEduCourseId, {
        password,
        name: team.name,
        email: team.email ?? undefined,
      });
      if (!result?.userId) throw new Error("Enrolment succeeded but no userId returned");
      lmsUserId = result.userId;
      enrolled  = true;
    } else {
      // No course attached — just provision/locate the account
      const check = await eptimEdu.userExists(username);
      if (check?.exists) {
        lmsUserId = check.user.id;
      } else {
        const created = await eptimEdu.createUser({
          username, password, name: team.name, email: team.email ?? undefined,
        });
        lmsUserId = created.id;
      }
    }

    await db.team.update({
      where: { id },
      data: { lmsUserId, lmsPassword: password, lmsCourseEnrolled: enrolled },
    });

    return NextResponse.json({ data: { username, password, enrolled } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
