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

export async function getManagerCourseList(
  contingentIds: string[],
  username: string | null,
): Promise<CourseInfo[]> {
  if (contingentIds.length === 0) return [];

  // Fetch all teams with their competition and event registrations
  const teams = await db.team.findMany({
    where: { contingentId: { in: contingentIds } },
    select: {
      competitionId: true,
      competition: { select: { name: true, eptimEduCourseId: true } },
      teamEvents: { select: { eventId: true } },
    },
  });
  if (teams.length === 0) return [];

  const competitionIds = [...new Set(teams.map((t) => t.competitionId))];
  const eventIds       = [...new Set(teams.flatMap((t) => t.teamEvents.map((te) => te.eventId)))];

  // Event-level course overrides (EventCompetition.eptimEduCourseId)
  const eventComps = eventIds.length > 0
    ? await db.eventCompetition.findMany({
        where: {
          competitionId: { in: competitionIds },
          eventId:       { in: eventIds },
          eptimEduCourseId: { not: null },
        },
        select: { competitionId: true, eptimEduCourseId: true, eptimEduCourseTitle: true },
      })
    : [];

  // Build a deduplicated map: courseId → display name
  // Competition-level first, then event-level overrides add any new courseIds
  const courseEntries = new Map<string, string>(); // courseId → competitionName

  for (const t of teams) {
    const id = t.competition.eptimEduCourseId;
    if (id && !courseEntries.has(id)) courseEntries.set(id, t.competition.name);
  }
  for (const ec of eventComps) {
    const id = ec.eptimEduCourseId!;
    if (!courseEntries.has(id)) {
      const fallback = teams.find((t) => t.competitionId === ec.competitionId)?.competition.name ?? id;
      courseEntries.set(id, ec.eptimEduCourseTitle ?? fallback);
    }
  }

  if (courseEntries.size === 0) return [];

  const [coursesResult, enrolResult] = await Promise.allSettled([
    eptimEdu.courses(),
    username
      ? eptimEdu.getUserEnrolments(username)
      : Promise.resolve({ enrolments: [] }),
  ]);

  const courseMap = new Map<string, { title: string; thumbnail: string | null; slug: string }>();
  if (coursesResult.status === "fulfilled") {
    for (const c of coursesResult.value?.courses ?? []) {
      courseMap.set(c.id, { title: c.title, thumbnail: c.thumbnail ?? null, slug: c.slug ?? "" });
    }
  }

  const enrolledIds = new Set<string>();
  if (enrolResult.status === "fulfilled") {
    for (const e of enrolResult.value?.enrolments ?? []) {
      enrolledIds.add(e.courseId);
    }
  }

  return [...courseEntries.entries()].map(([courseId, competitionName]) => {
    const course = courseMap.get(courseId);
    return {
      courseId,
      title:           course?.title     ?? `Course ${courseId}`,
      thumbnail:       course?.thumbnail ?? null,
      slug:            course?.slug      ?? "",
      competitionName,
      enrolled:        enrolledIds.has(courseId),
    };
  });
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
