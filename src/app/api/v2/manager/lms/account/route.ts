import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function randomPassword(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

const PUBLIC_URL = process.env.EPTIMEDU_PUBLIC_URL ?? process.env.EPTIMEDU_BASE_URL ?? "";
const LOGIN_URL  = `${PUBLIC_URL}/auth/login`;

// ── Course list helper ────────────────────────────────────────────────────────

export type CourseInfo = {
  courseId: string;
  title: string;
  thumbnail: string | null;
  slug: string;
  competitionName: string;
  enrolled: boolean;
};

// Build a map of courseId → competitionName from DB (competition-level + event-level overrides)
async function buildDbCourseNames(contingentIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (contingentIds.length === 0) return names;

  const teams = await db.team.findMany({
    where: { contingentId: { in: contingentIds } },
    select: {
      competitionId: true,
      competition: { select: { name: true, eptimEduCourseId: true } },
      teamEvents: { select: { eventId: true } },
    },
  });
  if (teams.length === 0) return names;

  for (const t of teams) {
    const id = t.competition.eptimEduCourseId;
    if (id && !names.has(id)) names.set(id, t.competition.name);
  }

  const compIds  = [...new Set(teams.map((t) => t.competitionId))];
  const eventIds = [...new Set(teams.flatMap((t) => t.teamEvents.map((te) => te.eventId)))];
  if (eventIds.length > 0) {
    const ecs = await db.eventCompetition.findMany({
      where: { competitionId: { in: compIds }, eventId: { in: eventIds }, eptimEduCourseId: { not: null } },
      select: { competitionId: true, eptimEduCourseId: true, eptimEduCourseTitle: true },
    });
    for (const ec of ecs) {
      const id = ec.eptimEduCourseId!;
      if (!names.has(id)) {
        const fallback = teams.find((t) => t.competitionId === ec.competitionId)?.competition.name ?? id;
        names.set(id, ec.eptimEduCourseTitle ?? fallback);
      }
    }
  }
  return names;
}

export async function getManagerCourseList(
  contingentIds: string[],
  username: string | null,
): Promise<CourseInfo[]> {
  if (contingentIds.length === 0) return [];

  const [dbNames, coursesResult, enrolResult] = await Promise.all([
    buildDbCourseNames(contingentIds),
    eptimEdu.courses().catch(() => ({ courses: [] })),
    username
      ? eptimEdu.getUserEnrolments(username).catch(() => ({ enrolments: [] }))
      : Promise.resolve({ enrolments: [] }),
  ]);

  const courseMap = new Map<string, { title: string; thumbnail: string | null; slug: string }>();
  for (const c of (coursesResult as { courses: { id: string; title: string; thumbnail?: string | null; slug?: string }[] })?.courses ?? []) {
    courseMap.set(c.id, { title: c.title, thumbnail: c.thumbnail ?? null, slug: c.slug ?? "" });
  }

  const enrolledIds = new Set<string>();
  for (const e of (enrolResult as { enrolments: { courseId: string }[] })?.enrolments ?? []) {
    enrolledIds.add(e.courseId);
  }

  // Merge: enrolled courses from EptimEdu (source of truth) + unenrolled DB-mapped courses
  const result = new Map<string, CourseInfo>();

  // 1. All enrolled courses — EptimEdu is authoritative here
  for (const courseId of enrolledIds) {
    const course = courseMap.get(courseId);
    result.set(courseId, {
      courseId,
      title:           course?.title     ?? `Course ${courseId}`,
      thumbnail:       course?.thumbnail ?? null,
      slug:            course?.slug      ?? "",
      competitionName: dbNames.get(courseId) ?? course?.title ?? courseId,
      enrolled:        true,
    });
  }

  // 2. DB-mapped courses not yet enrolled
  for (const [courseId, competitionName] of dbNames) {
    if (!result.has(courseId)) {
      const course = courseMap.get(courseId);
      result.set(courseId, {
        courseId,
        title:           course?.title     ?? `Course ${courseId}`,
        thumbnail:       course?.thumbnail ?? null,
        slug:            course?.slug      ?? "",
        competitionName,
        enrolled:        false,
      });
    }
  }

  return [...result.values()];
}

// ── GET — check account status + courses ─────────────────────────────────────

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

  const username      = emailToUsername(manager.email);
  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  if (manager.lmsUserId) {
    const [userRes, coursesRes] = await Promise.allSettled([
      eptimEdu.userExists(username),
      getManagerCourseList(contingentIds, username),
    ]);
    const user    = userRes.status    === "fulfilled" ? (userRes.value?.user    ?? null) : null;
    const courses = coursesRes.status === "fulfilled" ?  coursesRes.value               : [];
    return NextResponse.json({
      registered: true, username, loginUrl: LOGIN_URL,
      loginCount:  user?.loginCount  ?? 0,
      lastLoginAt: user?.lastLoginAt ?? null,
      courses,
    });
  }

  // No lmsUserId — check live whether it already exists
  const courses = await getManagerCourseList(contingentIds, null).catch(() => []);

  try {
    const result = await eptimEdu.userExists(username);
    if (result?.exists) {
      await db.managerProfile.update({
        where: { clerkUserId: userId },
        data:  { lmsUserId: result.user.id },
      });
      return NextResponse.json({
        registered: true, username, loginUrl: LOGIN_URL,
        loginCount:  result.user?.loginCount  ?? 0,
        lastLoginAt: result.user?.lastLoginAt ?? null,
        courses: await getManagerCourseList(contingentIds, username).catch(() => courses),
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ registered: false, username, loginUrl: LOGIN_URL, courses });
}

// ── POST — create account ─────────────────────────────────────────────────────

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const username = emailToUsername(manager.email);
  const password = randomPassword(8);

  try {
    const check = await eptimEdu.userExists(username);
    let lmsUserId: string;
    let finalPassword = password;

    if (check?.exists) {
      lmsUserId     = check.user.id;
      finalPassword = manager.lmsPassword ?? password;
    } else {
      let created: { id: string };
      try {
        created = await eptimEdu.createUser({
          username, password, name: manager.name, email: manager.email,
        });
      } catch (emailErr: unknown) {
        const errMsg = emailErr instanceof Error ? emailErr.message : "";
        if (errMsg.toLowerCase().includes("email")) {
          created = await eptimEdu.createUser({ username, password, name: manager.name });
        } else {
          throw emailErr;
        }
      }
      lmsUserId = created.id;
    }

    await db.managerProfile.update({
      where: { clerkUserId: userId },
      data:  { lmsUserId, lmsPassword: finalPassword },
    });

    return NextResponse.json({ username, password: finalPassword, loginUrl: LOGIN_URL });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[lms/account POST] eptim-edu error:", msg, { username });
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
