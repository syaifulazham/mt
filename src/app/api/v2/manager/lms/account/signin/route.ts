import { NextResponse } from "next/server";
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

/** POST — auto-enrol in missing competition courses, then generate SSO token */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  if (!manager.lmsUserId) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });

  const username      = emailToUsername(manager.email);
  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  // ── Auto-enrol in any competition courses not yet enrolled ────────────────
  if (contingentIds.length > 0) {
    try {
      const competitions = await db.competition.findMany({
        where: {
          eptimEduCourseId: { not: null },
          teams: { some: { contingentId: { in: contingentIds } } },
        },
        select: { eptimEduCourseId: true },
      });

      if (competitions.length > 0) {
        const enrolResult = await eptimEdu.getUserEnrolments(username).catch(() => ({ enrolments: [] }));
        const enrolledIds = new Set<string>(
          (enrolResult.enrolments ?? []).map((e: { courseId: string }) => e.courseId)
        );
        const toEnrol = [...new Set(competitions.map((c) => c.eptimEduCourseId!))].filter(
          (id) => !enrolledIds.has(id)
        );
        if (toEnrol.length > 0) {
          await Promise.allSettled(toEnrol.map((courseId) => eptimEdu.enrol(username, courseId)));
        }
      }
    } catch (e) {
      console.error("[lms/account/signin] auto-enrol error:", e);
    }
  }

  // ── Generate SSO token ────────────────────────────────────────────────────
  try {
    const result = await eptimEdu.createSsoToken(username);
    return NextResponse.json({ loginUrl: result.loginUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[lms/account/signin POST] eptim-edu error:", msg, { username });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
