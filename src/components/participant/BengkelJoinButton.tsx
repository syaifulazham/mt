"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Loader2, AlertCircle, ExternalLink, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = { hasAccount: boolean };
type LoginButtonProps = { pendingCourses: { courseId: string; title: string }[] };
type CourseStatus = "pending" | "enrolling" | "done" | "error";

// ── Enrolment progress modal ───────────────────────────────────────────────────

function EnrolModal({
  courses,
  onComplete,
  onClose,
}: {
  courses: { courseId: string; title: string }[];
  onComplete: (loginUrl: string) => void;
  onClose: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, CourseStatus>>(
    Object.fromEntries(courses.map(c => [c.courseId, "pending"]))
  );
  const [started,   setStarted]   = useState(false);
  const [globalErr, setGlobalErr] = useState("");

  function setStatus(courseId: string, s: CourseStatus) {
    setStatuses(prev => ({ ...prev, [courseId]: s }));
  }

  async function runEnrolment() {
    setStarted(true);
    setGlobalErr("");

    // Enrol sequentially so the user can watch progress
    for (const course of courses) {
      setStatus(course.courseId, "enrolling");
      try {
        const res  = await fetch("/api/v2/participant/bengkel/enrol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.courseId }),
        });
        const data = await res.json();
        setStatus(course.courseId, data.ok ? "done" : "error");
      } catch {
        setStatus(course.courseId, "error");
      }
    }

    // Generate SSO token and hand off
    try {
      const res  = await fetch("/api/v2/participant/bengkel/signin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "SSO gagal");
      onComplete(data.loginUrl);
    } catch (e) {
      setGlobalErr(e instanceof Error ? e.message : "Ralat semasa log masuk.");
    }
  }

  const allDone = courses.every(c => statuses[c.courseId] === "done");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!started ? onClose : undefined} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold dark:text-zinc-100">Pendaftaran Kursus</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {started
                ? allDone ? "Semua kursus berjaya didaftarkan." : "Sedang mendaftarkan…"
                : `${courses.length} kursus belum didaftar. Teruskan?`}
            </p>
          </div>
          {!started && (
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Course list */}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-64 overflow-y-auto">
          {courses.map(course => {
            const s = statuses[course.courseId];
            return (
              <li key={course.courseId} className="flex items-center gap-3 px-5 py-3">
                <span className="shrink-0 h-6 w-6 flex items-center justify-center">
                  {s === "pending"   && <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />}
                  {s === "enrolling" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {s === "done"      && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {s === "error"     && <AlertCircle  className="h-4 w-4 text-red-400" />}
                </span>
                <span className={`text-xs flex-1 min-w-0 truncate ${
                  s === "done"  ? "text-zinc-500 dark:text-zinc-400 line-through" :
                  s === "error" ? "text-red-500" : "dark:text-zinc-200"
                }`}>
                  {course.title}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          {globalErr && (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{globalErr}
            </p>
          )}
          {!started ? (
            <button
              onClick={runEnrolment}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <BookOpen className="h-4 w-4" /> Daftar &amp; Buka LMS
            </button>
          ) : allDone ? (
            <p className="text-center text-xs text-zinc-400">Membuka Eptim Education LMS…</p>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sila tunggu…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SSO login button (shown when account exists) ───────────────────────────────

export function BengkelLoginButton({ pendingCourses }: LoginButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleDirectLogin() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/bengkel/signin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ralat.");
      window.open(data.loginUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat rangkaian.");
    } finally {
      setLoading(false);
    }
  }

  function handleComplete(loginUrl: string) {
    setModalOpen(false);
    window.open(loginUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => pendingCourses.length > 0 ? setModalOpen(true) : handleDirectLogin()}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-60 text-sm font-medium px-4 py-2 transition-colors dark:text-zinc-100"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <ExternalLink className="h-3.5 w-3.5" />}
        Buka Eptim Education LMS
      </button>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}

      {modalOpen && (
        <EnrolModal
          courses={pendingCourses}
          onComplete={handleComplete}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Join button (shown when no account yet) ────────────────────────────────────

export function BengkelJoinButton({ hasAccount }: Props) {
  const [loading, setLoading]   = useState(false);
  const [result,  setResult]    = useState<{ username: string; enrolled: number } | null>(null);
  const [error,   setError]     = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/bengkel/join", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "NO_IC") setError("Nombor IC anda tidak ditemui dalam rekod. Sila hubungi pengurus kontingen.");
        else setError(data.error ?? "Ralat semasa menyertai LMS.");
        return;
      }
      setResult(data);
    } catch {
      setError("Ralat rangkaian. Sila cuba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
          <CheckCircle2 className="h-5 w-5" />
          {result.enrolled > 0
            ? `Berjaya! Didaftarkan ke ${result.enrolled} kursus.`
            : "Akaun LMS sedia ada. Pendaftaran kursus dikemaskini."}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ID Pengguna LMS: <span className="font-mono font-semibold">{result.username}</span>
        </p>
        <BengkelLoginButton pendingCourses={[]} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <button
        onClick={handleJoin}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
        {hasAccount ? "Daftar Kursus Baharu" : "Sertai Bengkel"}
      </button>
      {!hasAccount && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Akaun LMS akan dicipta secara automatik menggunakan nombor IC anda sebagai ID pengguna.
        </p>
      )}
    </div>
  );
}
