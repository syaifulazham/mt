import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";
import { getManagerCourseList } from "../account/route";

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

type ProgressData = {
  enrolled: boolean;
  isComplete: boolean;
  completedAt: string | null;
  completionPercent: number;
  hasSubmission: boolean;
  submissionCount: number;
  lastSubmittedAt: string | null;
} | null;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ courses: [], managers: [] });

  // All managers in the same contingents (deduped)
  const rows = await db.contingentManager.findMany({
    where: { contingentId: { in: contingentIds }, status: "ACTIVE" },
    select: {
      manager: {
        select: { id: true, name: true, email: true, lmsUserId: true, clerkUserId: true },
      },
    },
  });

  const seen = new Set<string>();
  const managers = rows
    .map((r) => r.manager)
    .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

  // Courses linked to competitions for these contingents
  const courses = await getManagerCourseList(contingentIds, null).catch(() => []);
  const courseIds = courses.map((c) => c.courseId);

  const sharedCourses = courses.map((c) => ({
    courseId: c.courseId,
    title: c.title,
    competitionName: c.competitionName,
  }));

  if (courseIds.length === 0 || managers.length === 0) {
    return NextResponse.json({
      courses: sharedCourses,
      managers: managers.map((m) => ({
        id: m.id, name: m.name, email: m.email,
        username: emailToUsername(m.email),
        isMe: m.clerkUserId === userId,
        lmsUserId: m.lmsUserId,
        progress: {},
      })),
    });
  }

  // Fetch progress for each registered manager × each course in parallel
  const registeredManagers = managers.filter((m) => !!m.lmsUserId);
  const pairs = registeredManagers.flatMap((m) =>
    courseIds.map((courseId) => ({ managerId: m.id, username: emailToUsername(m.email), courseId }))
  );

  const results = await Promise.allSettled(
    pairs.map(({ managerId, username, courseId }) =>
      eptimEdu.getUserCourseProgress(username, courseId)
        .then((data: ProgressData) => ({ managerId, courseId, data: data ?? null }))
        .catch(() => ({ managerId, courseId, data: null as ProgressData }))
    )
  );

  const progressMap = new Map<string, Record<string, ProgressData>>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      const { managerId, courseId, data } = r.value;
      if (!progressMap.has(managerId)) progressMap.set(managerId, {});
      progressMap.get(managerId)![courseId] = data;
    }
  }

  return NextResponse.json({
    courses: sharedCourses,
    managers: managers.map((m) => ({
      id: m.id, name: m.name, email: m.email,
      username: emailToUsername(m.email),
      isMe: m.clerkUserId === userId,
      lmsUserId: m.lmsUserId,
      progress: progressMap.get(m.id) ?? {},
    })),
  });
}
