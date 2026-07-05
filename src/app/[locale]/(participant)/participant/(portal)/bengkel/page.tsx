import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";
import { BengkelJoinButton, BengkelLoginButton } from "@/components/participant/BengkelJoinButton";
import type { Metadata } from "next";
import { BookOpen, Info, AlertTriangle, GraduationCap, CheckCircle2, Clock } from "lucide-react";

export const metadata: Metadata = { title: "Bengkel" };

export default async function BengkelPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { name: true, ic: true, eduLevel: true, ppki: true },
  });
  if (!participant) redirect("/participant/sign-in");

  const configured = eptimEduConfigured();

  // Competitions that have an LMS course attached and match the participant
  const lmsCourseComps = configured
    ? await db.competition.findMany({
        where: {
          eptimEduCourseId: { not: null },
          targetGroups: {
            some: {
              targetGroup: {
                schoolLevel: participant.eduLevel,
                ...(participant.ppki ? {} : { ppki: false }),
              },
            },
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          eptimEduCourseId: true,
          eptimEduCourseTitle: true,
          theme: { select: { color: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  // Fetch published course IDs from EptimEdu + check LMS account in parallel
  let lmsUser: { username: string } | null = null;
  let enrolledCourseIds = new Set<string>();
  const publishedCourseIds = new Set<string>();

  if (configured) {
    const icDigits = participant.ic ? participant.ic.replace(/\D/g, "") : null;

    // courses() and userExists() are independent — run in parallel
    const [coursesResult, existsResult] = await Promise.allSettled([
      eptimEdu.courses(),
      icDigits ? eptimEdu.userExists(icDigits) : Promise.resolve(null),
    ]);

    const coursesData = coursesResult.status === "fulfilled" ? coursesResult.value : { courses: [] };
    for (const c of coursesData.courses ?? []) {
      if (c.status === "published") publishedCourseIds.add(c.id);
    }

    if (existsResult.status === "fulfilled" && existsResult.value?.exists && icDigits) {
      lmsUser = { username: icDigits };
      const enrolResult = await eptimEdu.getUserEnrolments(icDigits).catch(() => ({ enrolments: [] }));
      enrolledCourseIds = new Set(
        (enrolResult.enrolments ?? []).map((e: { courseId: string }) => e.courseId)
      );
    }
  }

  // Only show courses that are published in EptimEdu
  const visibleComps = lmsCourseComps.filter(
    c => c.eptimEduCourseId && publishedCourseIds.has(c.eptimEduCourseId)
  );

  const hasIc = !!participant.ic;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Bengkel</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Kursus pembelajaran dalam talian berkaitan pertandingan anda
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-4 py-3.5">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-400" />
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <p className="font-medium">Halaman ini dihubungkan dengan Eptim Education LMS</p>
          <p className="text-blue-700 dark:text-blue-400 font-normal">
            Platform pembelajaran dalam talian yang menyediakan kursus, bahan rujukan, dan latihan
            berkaitan pertandingan Techlympics. Gunakan nombor IC anda sebagai ID pengguna untuk log masuk.
          </p>
        </div>
      </div>

      {/* LMS not configured */}
      {!configured && (
        <div className="flex gap-3 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Sistem LMS belum dikonfigurasikan. Sila hubungi penganjur untuk maklumat lanjut.
          </p>
        </div>
      )}

      {/* No IC warning */}
      {configured && !hasIc && (
        <div className="flex gap-3 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Nombor IC anda tidak ditemui dalam rekod. Sila hubungi pengurus kontingen untuk
            kemaskini maklumat sebelum menyertai bengkel.
          </p>
        </div>
      )}

      {/* LMS account status + join button */}
      {configured && hasIc && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <h2 className="font-semibold dark:text-zinc-100">Akaun LMS</h2>
          </div>

          {lmsUser ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Akaun anda sudah wujud di Eptim Education LMS.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">ID Pengguna:</span>
                <span className="font-mono font-semibold dark:text-zinc-100">{lmsUser.username}</span>
              </div>
              <BengkelLoginButton pendingCourses={visibleComps
                .filter(c => c.eptimEduCourseId && !enrolledCourseIds.has(c.eptimEduCourseId))
                .map(c => ({ courseId: c.eptimEduCourseId!, title: c.eptimEduCourseTitle ?? c.name }))} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Anda belum mempunyai akaun LMS. Tekan butang di bawah untuk mencipta akaun dan
                mendaftar ke semua kursus yang berkaitan secara automatik.
              </p>
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                <p>• ID Pengguna: nombor IC anda (digit sahaja)</p>
                <p>• Kata laluan awal: 2 huruf pertama nama + 6 digit IC pertama</p>
                <p>• Kata laluan boleh ditukar selepas log masuk ke LMS</p>
              </div>
            </div>
          )}

          <BengkelJoinButton hasAccount={!!lmsUser} />
        </div>
      )}

      {/* Available LMS courses */}
      {configured && visibleComps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold dark:text-zinc-100 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-zinc-400" />
              Kursus Tersedia
            </h2>
            {lmsUser && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {`${visibleComps.filter(c => enrolledCourseIds.has(c.eptimEduCourseId!)).length}/${visibleComps.length} didaftar`}
              </span>
            )}
          </div>
          {visibleComps.map((comp) => {
            const themeColor = comp.theme?.color ?? "#085782";
            const enrolled   = !!comp.eptimEduCourseId && enrolledCourseIds.has(comp.eptimEduCourseId);
            return (
              <div
                key={comp.id}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex"
              >
                <div className="w-1.5 shrink-0" style={{ backgroundColor: themeColor }} />
                <div className="flex-1 px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold dark:text-zinc-100 truncate">
                      {comp.eptimEduCourseTitle ?? "Kursus LMS"}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="font-mono">{comp.code}</span> — {comp.name}
                    </p>
                  </div>
                  {lmsUser && (
                    enrolled ? (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 px-2 py-0.5 text-[11px] font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Didaftar
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 text-[11px]">
                        <Clock className="h-3 w-3" /> Belum daftar
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No LMS courses */}
      {configured && visibleComps.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-14 px-6 text-center">
          <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
            <BookOpen className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium dark:text-zinc-200">Tiada kursus buat masa ini</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Kursus bengkel akan dipaparkan di sini apabila tersedia untuk pertandingan anda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
