import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";
import { BengkelJoinButton } from "@/components/participant/BengkelJoinButton";
import type { Metadata } from "next";
import { BookOpen, Info, AlertTriangle, GraduationCap, ExternalLink } from "lucide-react";

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
  const lmsBaseUrl = process.env.EPTIMEDU_BASE_URL ?? "";

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

  // Check if participant already has an LMS account
  let lmsUser: { username: string } | null = null;
  if (configured && participant.ic) {
    const icDigits = participant.ic.replace(/\D/g, "");
    try {
      const check = await eptimEdu.userExists(icDigits);
      if (check?.exists) lmsUser = { username: icDigits };
    } catch {
      // 404 or network error = no account, silently ignored
    }
  }

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
              {lmsBaseUrl && (
                <a
                  href={lmsBaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium px-4 py-2 transition-colors dark:text-zinc-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Buka Eptim Education LMS
                </a>
              )}
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

          <BengkelJoinButton hasAccount={!!lmsUser} lmsBaseUrl={lmsBaseUrl} />
        </div>
      )}

      {/* Available LMS courses */}
      {configured && lmsCourseComps.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold dark:text-zinc-100 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-zinc-400" />
            Kursus Tersedia
          </h2>
          {lmsCourseComps.map((comp) => {
            const themeColor = comp.theme?.color ?? "#085782";
            return (
              <div
                key={comp.id}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex"
              >
                <div className="w-1.5 shrink-0" style={{ backgroundColor: themeColor }} />
                <div className="flex-1 px-4 py-3.5 space-y-0.5">
                  <p className="text-sm font-semibold dark:text-zinc-100">
                    {comp.eptimEduCourseTitle ?? "Kursus LMS"}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Pertandingan:{" "}
                    <span className="font-mono">{comp.code}</span> — {comp.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No LMS courses */}
      {configured && lmsCourseComps.length === 0 && (
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
