import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";
import type { CourseMeta } from "@/components/organizer/workshops/parts";

type ApiCourse = {
  id: string; title: string; status: string; subtitle?: string | null; instructor?: string;
  totalMinutes?: number; enrolmentCount?: number;
};

/**
 * Course details from EptimEdu, keyed by course id. Workshop stats don't depend
 * on this, so a failure is returned as `error` rather than thrown.
 */
export async function loadWorkshopCourses(): Promise<{ courses: Record<string, CourseMeta>; error: string | null }> {
  if (!eptimEduConfigured()) return { courses: {}, error: "EptimEdu is not configured" };
  try {
    const data = await eptimEdu.courses();
    const courses: Record<string, CourseMeta> = {};
    for (const c of (data?.courses ?? []) as ApiCourse[]) {
      courses[c.id] = {
        title: c.title, status: c.status, subtitle: c.subtitle ?? null, instructor: c.instructor ?? null,
        totalMinutes: c.totalMinutes ?? null, enrolmentCount: c.enrolmentCount ?? null,
      };
    }
    return { courses, error: null };
  } catch (e: unknown) {
    return { courses: {}, error: e instanceof Error ? e.message : "EptimEdu API error" };
  }
}
