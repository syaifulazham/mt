import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { Info } from "lucide-react";
import { ChangePasswordForm } from "@/components/participant/ChangePasswordForm";

export const metadata: Metadata = { title: "Profil Saya" };

/* ── helpers ─────────────────────────────────────────────────────────── */

function maskIc(ic: string | null): string {
  if (!ic) return "—";
  // e.g. "990101-14-1234" or "990101141234"
  const digits = ic.replace(/\D/g, "");
  if (digits.length < 4) return "••••••";
  const last4 = digits.slice(-4);
  return `••••••-••-${last4}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const EDU_LABEL: Record<string, string> = {
  PRIMARY:   "Sekolah Rendah",
  SECONDARY: "Sekolah Menengah",
  YOUTH:     "Belia / Umum",
};

const GENDER_LABEL: Record<string, string> = {
  MALE:   "Lelaki",
  FEMALE: "Perempuan",
};

/* ── component ───────────────────────────────────────────────────────── */

export default async function ProfilePage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    include: { contingent: { select: { name: true } } },
  });

  if (!participant) redirect("/participant/sign-in");

  const initials = getInitials(participant.name);
  const contingentName = participant.contingent?.name ?? "—";
  const eduLabel = EDU_LABEL[participant.eduLevel] ?? participant.eduLevel;
  const genderLabel = GENDER_LABEL[participant.gender] ?? participant.gender;

  return (
    <div className="max-w-xl space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Profil Saya</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Maklumat peribadi anda
        </p>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">

        {/* Avatar + name row */}
        <div className="flex items-center gap-4">
          <div
            className="h-16 w-16 shrink-0 rounded-full flex items-center justify-center text-white text-xl font-bold select-none"
            style={{
              background: "linear-gradient(135deg, #085782 0%, #e75262 100%)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight dark:text-zinc-100 truncate">
              {participant.name}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {contingentName}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {/* Gender */}
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
              ${participant.gender === "MALE"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                : "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300"
              }`}
          >
            {genderLabel}
          </span>

          {/* PPKI */}
          {participant.ppki && (
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
              PPKI
            </span>
          )}

          {/* Edu level */}
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {eduLabel}
          </span>
        </div>

        {/* Details grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
              No. IC
            </dt>
            <dd className="mt-0.5 text-sm font-mono dark:text-zinc-200">
              {maskIc(participant.ic)}
            </dd>
          </div>

          {participant.age != null && (
            <div>
              <dt className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                Umur
              </dt>
              <dd className="mt-0.5 text-sm dark:text-zinc-200">
                {participant.age} tahun
              </dd>
            </div>
          )}

          {participant.classGrade && (
            <div>
              <dt className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                Tingkatan / Darjah
              </dt>
              <dd className="mt-0.5 text-sm dark:text-zinc-200">
                {participant.classGrade}
              </dd>
            </div>
          )}

          {participant.className && (
            <div>
              <dt className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                Nama Kelas
              </dt>
              <dd className="mt-0.5 text-sm dark:text-zinc-200">
                {participant.className}
              </dd>
            </div>
          )}

          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
              Kontingen
            </dt>
            <dd className="mt-0.5 text-sm dark:text-zinc-200">
              {contingentName}
            </dd>
          </div>
        </dl>
      </div>

      {/* Read-only notice */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Untuk kemaskini maklumat, hubungi pengurus kontingen anda.
        </p>
      </div>

      {/* Change password */}
      <ChangePasswordForm />
    </div>
  );
}
