import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

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

// POST — create or verify the EptimEdu account for a team (no course enrolment)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EptimEdu is not configured on this server." }, { status: 503 });

  const { id: contingentId, teamId } = await params;

  const team = await db.team.findUnique({
    where: { id: teamId, contingentId },
    select: { id: true, name: true, email: true, lmsUserId: true },
  });

  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (!team.email)
    return NextResponse.json({ error: "Team has no email address." }, { status: 400 });

  const username = emailToUsername(team.email);

  try {
    let lmsUserId = team.lmsUserId;
    const check = await eptimEdu.userExists(username);

    if (check?.exists || check?.id) {
      lmsUserId = lmsUserId ?? check.user?.id ?? check.id;
      // Sync email/name in case it drifted
      try {
        await eptimEdu.updateUser(username, { email: team.email, name: team.name });
      } catch {
        // updateUser failure is non-fatal
      }
    } else {
      const password = Array.from({ length: 6 }, () =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"[
          Math.floor(Math.random() * 55)
        ]).join("");
      const created = await eptimEdu.createUser({
        username,
        password,
        name: team.name,
        email: team.email,
      });
      lmsUserId = created.id;
    }

    await db.team.update({
      where: { id: teamId },
      data: { lmsUserId },
    });

    return NextResponse.json({ success: true, username, lmsUserId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "EptimEdu API error.";
    const upstreamStatus = (err as { status?: number })?.status;
    const upstreamBody   = (err as { body?: unknown })?.body;
    console.error("[register-lms] EptimEdu error:", { message, upstreamStatus, upstreamBody });
    return NextResponse.json({ error: message, upstreamStatus, upstreamBody }, { status: 502 });
  }
}
