"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2, Trophy, Mail, CheckCircle2, BookOpen, Copy, AlertCircle, KeyRound, GraduationCap, BadgeCheck, LogIn, UserCircle2, ExternalLink, Upload, Eye,
  ChevronLeft, ChevronRight, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────────────────────────

type CourseInfo = {
  courseId: string;
  title: string;
  thumbnail: string | null;
  slug: string;
  competitionName: string;
  enrolled: boolean;
};

type TeamCourse = { courseId: string; label: string | null };

type Team = {
  id: string;
  name: string;
  email: string | null;
  lmsUserId: string | null;
  lmsPassword: string | null;
  lmsCourseEnrolled: boolean;
  competition: {
    id: string; name: string; code: string;
    maxTeamSize: number; minTeamSize: number;
    eptimEduCourseId: string | null;
  };
  courses: TeamCourse[];  // ALL courses (competition + event-specific)
};

type Credentials = { username: string; password: string; enrolled: boolean };
type LoginStats  = { loginCount: number; lastLoginAt: string | null };
type StatsEntry  = LoginStats | null;  // null = fetched, no data

type ProgressEntry = {
  enrolled: boolean;
  isComplete: boolean;
  completedAt: string | null;
  completionPercent: number;
  hasSubmission: boolean;
  submissionCount: number;
  lastSubmittedAt: string | null;
} | null;  // null = fetched, no data (team not enrolled or API error)

type LessonEntry = {
  id: string; title: string; order: number; completed: boolean;
  pageCount: number; completedPageCount: number;
  pendingPages?: { id: string; title: string; order: number }[];
};
type ChapterEntry = {
  id: string; title: string; order: number;
  lessonCount: number; completedLessonCount: number;
  lessons: LessonEntry[];
};
type LessonProgressData = {
  status: string;
  lessonCount: number;
  completedLessonCount: number;
  completionPercent: number;
  chapters: ChapterEntry[];
};

// ── Key helper ─────────────────────────────────────────────────────────────────

const progKey = (teamId: string, courseId: string) => `${teamId}:${courseId}`;

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy}
      className="ml-1 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      title="Copy">
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Manager account section ────────────────────────────────────────────────────

type ManagerAccountStatus =
  | { registered: true;  username: string; loginUrl: string; loginCount: number; lastLoginAt: string | null; courses: CourseInfo[] }
  | { registered: false; username: string; loginUrl: string; courses: CourseInfo[] };

type ManagerProgressData = {
  enrolled: boolean;
  isComplete: boolean;
  completedAt: string | null;
  completionPercent: number;
  hasSubmission: boolean;
  submissionCount: number;
  lastSubmittedAt: string | null;
} | null;

type ContingentManagerEntry = {
  id: string;
  name: string;
  email: string;
  username: string;
  isMe: boolean;
  lmsUserId: string | null;
  progress: Record<string, ManagerProgressData>;
};

type ContingentManagersData = {
  courses: { courseId: string; title: string; competitionName: string }[];
  managers: ContingentManagerEntry[];
};

function CourseCard({ course }: { course: CourseInfo }) {
  return (
    <div className="relative rounded-lg border bg-zinc-50 dark:bg-zinc-800/50 dark:border-zinc-700 overflow-hidden flex flex-col">
      {course.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={course.thumbnail} alt={course.title} className="w-full h-24 object-cover" />
      ) : (
        <div className="w-full h-24 bg-gradient-to-br from-blue-100 to-indigo-200 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-blue-400" />
        </div>
      )}
      {course.enrolled && (
        <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <CheckCircle2 className="h-2.5 w-2.5" /> Enrolled
        </div>
      )}
      {!course.enrolled && (
        <div className="absolute top-2 right-2 bg-zinc-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full">
          Not enrolled
        </div>
      )}
      <div className="p-2.5 flex-1 flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-tight">
          {course.title}
        </p>
        <p className="text-[10px] text-zinc-400 truncate">{course.competitionName}</p>
      </div>
    </div>
  );
}

function ManagerAccountSection() {
  const [status,      setStatus]      = useState<ManagerAccountStatus | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [signingIn,   setSigningIn]   = useState(false);
  const [newCreds,    setNewCreds]    = useState<{ username: string; password: string; loginUrl: string } | null>(null);
  const [err,         setErr]         = useState("");
  const [managersData, setManagersData] = useState<ContingentManagersData | null>(null);
  const [coursesExpanded, setCoursesExpanded] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  async function reloadStatus() {
    try {
      const res = await fetch("/api/v2/manager/lms/account");
      const j   = await res.json();
      if (j.registered !== undefined) setStatus(j);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/v2/manager/lms/account")
        .then((r) => r.json())
        .then((j) => { if (j.registered !== undefined) setStatus(j); })
        .catch(() => {}),
      fetch("/api/v2/manager/lms/contingent-managers")
        .then((r) => r.json())
        .then((j) => { if (j.courses) setManagersData(j); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function createAccount() {
    setCreating(true); setErr("");
    try {
      const res = await fetch("/api/v2/manager/lms/account", { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setNewCreds(j);
      // Re-fetch full status (includes courses) after account creation
      await reloadStatus();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setCreating(false); }
  }

  async function signInToEptimEdu() {
    setSigningIn(true); setErr("");
    try {
      const res = await fetch("/api/v2/manager/lms/account/signin", { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      window.open(j.loginUrl, "_blank", "noopener,noreferrer");
      // Reload so newly enrolled courses show as enrolled
      await reloadStatus();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSigningIn(false); }
  }

  const courses = status?.courses ?? [];

  return (
    <>
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-zinc-50/80 dark:bg-zinc-800/60 dark:border-zinc-800">
          <UserCircle2 className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Your Bengkel MT Account</span>
        </div>

        <div className="px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking account…
            </div>
          ) : status === null ? (
            <p className="text-sm text-zinc-400">Bengkel MT is not configured.</p>
          ) : status.registered ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Account registered</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 ml-6">
                  <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
                    {status.username}
                  </span>
                  <CopyBtn text={status.username} />
                  {status.loginCount > 0 ? (
                    <span className="text-zinc-400">
                      · logged in {status.loginCount}×
                      {status.lastLoginAt && (
                        <> · {new Date(status.lastLoginAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</>
                      )}
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">· never logged in</span>
                  )}
                </div>
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={signingIn} onClick={signInToEptimEdu}>
                {signingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Sign in to Eptim Edu
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">You don&apos;t have a Bengkel MT account yet.</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Your username will be <span className="font-mono">{status.username}</span>
                </p>
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={creating} onClick={createAccount}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Create Account
              </Button>
            </div>
          )}

          {err && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}
            </p>
          )}

          {/* Courses — carousel (default) or expanded grid */}
          {!loading && courses.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                  Your Courses ({courses.filter(c => c.enrolled).length}/{courses.length} enrolled)
                </p>
                <div className="flex items-center gap-1">
                  {!coursesExpanded && (
                    <>
                      <button
                        onClick={() => carouselRef.current?.scrollBy({ left: -260, behavior: "smooth" })}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => carouselRef.current?.scrollBy({ left: 260, behavior: "smooth" })}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setCoursesExpanded(v => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {coursesExpanded
                      ? <><List className="h-3.5 w-3.5" /> Carousel</>
                      : <><LayoutGrid className="h-3.5 w-3.5" /> Lihat semua</>
                    }
                  </button>
                </div>
              </div>

              {coursesExpanded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {courses.map(course => (
                    <CourseCard key={course.courseId} course={course} />
                  ))}
                </div>
              ) : (
                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
                  style={{ scrollbarWidth: "none" }}
                >
                  {courses.map(course => (
                    <div key={course.courseId} className="snap-start shrink-0 w-52">
                      <CourseCard course={course} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Managers Progress — table with Manager, Email, Submission, Progress */}
          {!loading && managersData && managersData.courses.length > 0 && managersData.managers.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">
                Managers Progress ({managersData.managers.filter(m => m.lmsUserId).length}/{managersData.managers.length} registered)
              </p>
              <div className="rounded-lg border dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b dark:border-zinc-800">
                        <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Manager</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Email</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Submission</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-800">
                      {managersData.managers.map((m, idx) => (
                        <tr key={m.id} className={`${idx % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/40 dark:bg-zinc-800/20"} ${m.isMe ? "ring-1 ring-inset ring-blue-200 dark:ring-blue-800" : ""}`}>
                          {/* Manager */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                                {m.name[0]?.toUpperCase() ?? "?"}
                              </div>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{m.name}</span>
                              {m.isMe && <span className="text-[9px] text-blue-500 font-semibold">you</span>}
                              {!m.lmsUserId && <span className="text-[10px] text-zinc-400 italic ml-1">no account</span>}
                            </div>
                          </td>
                          {/* Email */}
                          <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{m.email}</td>
                          {/* Submission */}
                          <td className="px-4 py-2.5">
                            {m.lmsUserId ? (
                              <div className="space-y-1.5">
                                {managersData.courses.map((c) => {
                                  const p = m.progress[c.courseId];
                                  return (
                                    <div key={c.courseId}>
                                      <p className="text-[10px] text-zinc-400 truncate max-w-[200px]">{c.title}</p>
                                      {!p
                                        ? <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                        : p.hasSubmission && p.lastSubmittedAt
                                          ? <span className="font-medium text-green-600 dark:text-green-400">
                                              Submitted · {new Date(p.lastSubmittedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })}
                                            </span>
                                          : <span className="text-zinc-400">{p.submissionCount} submission{p.submissionCount !== 1 ? "s" : ""}</span>
                                      }
                                    </div>
                                  );
                                })}
                              </div>
                            ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                          </td>
                          {/* Progress */}
                          <td className="px-4 py-2.5">
                            {m.lmsUserId ? (
                              <div className="space-y-1.5">
                                {managersData.courses.map((c) => {
                                  const p = m.progress[c.courseId];
                                  return (
                                    <div key={c.courseId}>
                                      <p className="text-[10px] text-zinc-400 truncate max-w-[200px]">{c.title}</p>
                                      {!p
                                        ? <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                        : (
                                          <div className="flex items-center gap-2 min-w-[140px]">
                                            <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                              <div
                                                className={`h-full rounded-full ${p.isComplete ? "bg-green-500" : p.completionPercent > 0 ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
                                                style={{ width: `${p.completionPercent}%` }}
                                              />
                                            </div>
                                            <span className={`shrink-0 font-mono tabular-nums ${p.isComplete ? "text-green-600 dark:text-green-400 font-semibold" : "text-zinc-500"}`}>
                                              {p.isComplete
                                                ? <>Completed{p.completedAt && <> · {new Date(p.completedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })}</>}</>
                                                : `${p.completionPercent}%`}
                                            </span>
                                          </div>
                                        )
                                      }
                                    </div>
                                  );
                                })}
                              </div>
                            ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New-credentials dialog shown once after account creation */}
      {newCreds && (
        <Dialog open onOpenChange={() => setNewCreds(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" /> Account Created
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                Save your Bengkel MT credentials — the password won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Username</span>
                <div className="flex items-center font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                  {newCreds.username}<CopyBtn text={newCreds.username} />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Password</span>
                <div className="flex items-center font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                  {newCreds.password}<CopyBtn text={newCreds.password} />
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2">
              <Button
                className="w-full gap-1.5"
                disabled={signingIn}
                onClick={async () => { setNewCreds(null); await signInToEptimEdu(); }}
              >
                {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Sign in to Eptim Edu
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setNewCreds(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Credentials modal ──────────────────────────────────────────────────────────

function CredentialsDialog({
  creds, teamName, onClose,
}: {
  creds: Credentials | null;
  teamName: string;
  onClose: () => void;
}) {
  const t = useTranslations("lms");
  return (
    <Dialog open={!!creds} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" /> {t("credsTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs mt-1">
            {t.rich("credsDesc", {
              teamName,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        {creds && (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border bg-zinc-50 px-4 py-3 space-y-2 dark:bg-zinc-800 dark:border-zinc-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{t("credsUsername")}</span>
                <div className="flex items-center font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                  {creds.username}<CopyBtn text={creds.username} />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{t("credsPassword")}</span>
                <div className="flex items-center font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                  {creds.password}<CopyBtn text={creds.password} />
                </div>
              </div>
            </div>
            {creds.enrolled && (
              <p className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                {t("credsEnrolled")}
              </p>
            )}
            <p className="text-[11px] text-zinc-400">
              {t("credsNote")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{t("credsDone")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared hook: join / enrol actions ─────────────────────────────────────────

function useTeamLmsActions(
  team: Team,
  onJoined: (teamId: string, creds: Credentials) => void,
  onEnrolled: (teamId: string) => void,
) {
  const [joining,   setJoining]   = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [err,       setErr]       = useState("");

  async function join() {
    setJoining(true); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/lms`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onJoined(team.id, j.data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setJoining(false); }
  }

  async function enrol() {
    setEnrolling(true); setErr("");
    try {
      const res = await fetch(`/api/v2/manager/teams/${team.id}/lms/enrol`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onEnrolled(team.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setEnrolling(false); }
  }

  return { joining, enrolling, err, join, enrol };
}

// ── Team row — mobile card ─────────────────────────────────────────────────────

function TeamRow({
  team,
  stats,
  progressData,
  onJoined,
  onEnrolled,
  onReviewProgress,
}: {
  team: Team;
  stats: StatsEntry | undefined;
  progressData: Record<string, ProgressEntry | undefined>;
  onJoined: (teamId: string, creds: Credentials) => void;
  onEnrolled: (teamId: string) => void;
  onReviewProgress: (teamId: string, courseId: string) => void;
}) {
  const t = useTranslations("lms");
  const { joining, enrolling, err, join, enrol } = useTeamLmsActions(team, onJoined, onEnrolled);

  const hasAccount       = !!team.lmsUserId;
  const hasCourse        = !!team.competition.eptimEduCourseId;
  const compCourseId     = team.competition.eptimEduCourseId;
  const compProgressData = compCourseId ? progressData[compCourseId] : undefined;
  // Use live progress data (specific to competition's courseId) when available;
  // fall back to DB flag only while the progress fetch is still in-flight.
  const courseEnrolled   = compProgressData !== undefined
    ? (compProgressData?.enrolled === true)
    : team.lmsCourseEnrolled;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors dark:hover:bg-zinc-800/40">
      {/* Team name + email + login stats */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{team.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Mail className="h-3 w-3 text-zinc-400 shrink-0" />
          <span className={`text-xs truncate ${team.email ? "text-zinc-500" : "text-zinc-300 italic"}`}>
            {team.email ?? t("noEmail")}
          </span>
        </div>
        {hasAccount && (
          <div className="flex items-center gap-1 mt-1">
            <LogIn className="h-3 w-3 text-zinc-400 shrink-0" />
            <span className="text-xs text-zinc-500">
              {stats === undefined
                ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
                : stats === null
                  ? <span className="text-zinc-300">—</span>
                  : stats.loginCount > 0
                    ? <>{t("loginPrefix")} <span className="font-medium text-zinc-700 dark:text-zinc-300">{stats.loginCount}×</span>
                        {stats.lastLoginAt && (
                          <> · <span className="text-zinc-400">{new Date(stats.lastLoginAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })}</span></>
                        )}
                      </>
                    : <span className="text-zinc-400 italic">{t("neverLoggedIn")}</span>
              }
            </span>
          </div>
        )}
        {hasAccount && team.courses.map(c => {
          const pd = progressData[c.courseId];
          const courseLabel = c.label ?? c.courseId;
          return (
            <div key={c.courseId}>
              {/* Label chip — only shown when there are multiple courses */}
              {team.courses.length > 1 && (
                <span className="text-[10px] text-zinc-400 font-mono truncate">{courseLabel}</span>
              )}
              {/* Submission row */}
              {(pd === undefined || (pd !== null && pd.hasSubmission)) && (
                <div className="flex items-center gap-1 mt-1">
                  <Upload className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span className="text-xs text-zinc-500">
                    {pd === undefined
                      ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
                      : pd?.hasSubmission && pd.lastSubmittedAt
                        ? <span className="font-medium text-green-600 dark:text-green-400">
                            {t("submittedOn", { date: new Date(pd.lastSubmittedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" }) })}
                          </span>
                        : null
                    }
                  </span>
                </div>
              )}
              {/* Progress row */}
              <div className="flex items-center gap-1 mt-1">
                <GraduationCap className="h-3 w-3 text-zinc-400 shrink-0" />
                <span className="text-xs text-zinc-500">
                  {pd === undefined
                    ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
                    : !pd?.enrolled
                      ? null
                      : pd.isComplete
                        ? <span className="font-medium text-blue-600 dark:text-blue-400">
                            {t("courseCompleted", { date: pd.completedAt ? new Date(pd.completedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" }) : "—" })}
                          </span>
                        : <span className="text-zinc-500 dark:text-zinc-400">
                            {t("courseInProgress", { percent: pd.completionPercent })}
                            {pd.completionPercent > 0 && (
                              <button onClick={() => onReviewProgress(team.id, c.courseId)}
                                className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2">
                                <Eye className="h-3 w-3" /> {t("reviewProgress")}
                              </button>
                            )}
                          </span>
                  }
                </span>
              </div>
            </div>
          );
        })}
        {err && (
          <p className="flex items-center gap-1 text-[11px] text-red-600 mt-1">
            <AlertCircle className="h-3 w-3 shrink-0" />{err}
          </p>
        )}
      </div>

      {/* Status / actions */}
      <div className="shrink-0 flex items-center gap-2">
        {!hasAccount ? (
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={joining || !team.email}
            onClick={join}
            title={!team.email ? t("joinEmailTitle") : undefined}
          >
            {joining
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <KeyRound className="h-3.5 w-3.5" />}
            {t("joinBtn")}
          </Button>
        ) : courseEnrolled ? (
          <BadgeCheck className="h-8 w-8 text-blue-500" />
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />{t("registered")}
            </div>
            {hasCourse && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={enrolling}
                onClick={enrol}
              >
                {enrolling
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <GraduationCap className="h-3.5 w-3.5" />}
                {t("enrolBtn")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Team row — desktop table ───────────────────────────────────────────────────

function TeamTableRow({
  team,
  stats,
  progressData,
  index,
  onJoined,
  onEnrolled,
  onReviewProgress,
}: {
  team: Team;
  stats: StatsEntry | undefined;
  progressData: Record<string, ProgressEntry | undefined>;
  index: number;
  onJoined: (teamId: string, creds: Credentials) => void;
  onEnrolled: (teamId: string) => void;
  onReviewProgress: (teamId: string, courseId: string) => void;
}) {
  const t = useTranslations("lms");
  const { joining, enrolling, err, join, enrol } = useTeamLmsActions(team, onJoined, onEnrolled);

  const hasAccount       = !!team.lmsUserId;
  const hasCourse        = !!team.competition.eptimEduCourseId;
  const compCourseId     = team.competition.eptimEduCourseId;
  const compProgressData = compCourseId ? progressData[compCourseId] : undefined;
  // Use live progress data (specific to competition's courseId) when available;
  // fall back to DB flag only while the progress fetch is still in-flight.
  const courseEnrolled   = compProgressData !== undefined
    ? (compProgressData?.enrolled === true)
    : team.lmsCourseEnrolled;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });

  return (
    <tr className={index % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/40 dark:bg-zinc-800/20"}>
      {/* Team name */}
      <td className="px-4 py-2.5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{team.name}</p>
      </td>

      {/* Email */}
      <td className="px-4 py-2.5">
        <span className={`text-xs ${team.email ? "text-zinc-500" : "text-zinc-300 italic"}`}>
          {team.email ?? t("noEmail")}
        </span>
      </td>

      {/* Login */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {hasAccount ? (
          <span className="text-xs text-zinc-500">
            {stats === undefined
              ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
              : stats === null
                ? <span className="text-zinc-300">—</span>
                : stats.loginCount > 0
                  ? <><span className="font-medium text-zinc-700 dark:text-zinc-300">{stats.loginCount}×</span>
                      {stats.lastLoginAt && <span className="text-zinc-400"> · {fmtDate(stats.lastLoginAt)}</span>}
                    </>
                  : <span className="italic text-zinc-400">{t("neverLoggedIn")}</span>
            }
          </span>
        ) : <span className="text-zinc-300 text-xs">—</span>}
      </td>

      {/* Submission */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {hasAccount && team.courses.length > 0 ? (
          <div className="space-y-1">
            {team.courses.map(c => {
              const pd = progressData[c.courseId];
              return (
                <div key={c.courseId} className="text-xs">
                  {team.courses.length > 1 && (
                    <span className="text-[10px] text-zinc-400 font-mono block truncate">{c.label ?? c.courseId}</span>
                  )}
                  {pd === undefined
                    ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
                    : pd?.hasSubmission && pd.lastSubmittedAt
                      ? <span className="font-medium text-green-600 dark:text-green-400">
                          {t("submittedOn", { date: fmtDate(pd.lastSubmittedAt) })}
                        </span>
                      : <span className="text-zinc-300">—</span>
                  }
                </div>
              );
            })}
          </div>
        ) : <span className="text-zinc-300 text-xs">—</span>}
      </td>

      {/* Progress */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {hasAccount && team.courses.length > 0 ? (
          <div className="space-y-1">
            {team.courses.map(c => {
              const pd = progressData[c.courseId];
              return (
                <div key={c.courseId} className="text-xs">
                  {team.courses.length > 1 && (
                    <span className="text-[10px] text-zinc-400 font-mono block truncate">{c.label ?? c.courseId}</span>
                  )}
                  {pd === undefined
                    ? <Loader2 className="h-3 w-3 animate-spin text-zinc-300 inline" />
                    : !pd?.enrolled
                      ? <span className="text-zinc-300">—</span>
                      : pd.isComplete
                        ? <span className="font-medium text-blue-600 dark:text-blue-400">
                            {t("courseCompleted", { date: pd.completedAt ? fmtDate(pd.completedAt) : "—" })}
                          </span>
                        : <span className="text-zinc-500 dark:text-zinc-400">
                            {t("courseInProgress", { percent: pd.completionPercent })}
                            {pd.completionPercent > 0 && (
                              <button
                                onClick={() => onReviewProgress(team.id, c.courseId)}
                                className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                              >
                                <Eye className="h-3 w-3" /> {t("reviewProgress")}
                              </button>
                            )}
                          </span>
                  }
                </div>
              );
            })}
          </div>
        ) : <span className="text-zinc-300 text-xs">—</span>}
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {!hasAccount ? (
            <Button size="sm" className="h-7 text-xs gap-1.5 whitespace-nowrap"
              disabled={joining || !team.email} onClick={join}
              title={!team.email ? t("joinEmailTitle") : undefined}>
              {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {t("joinBtn")}
            </Button>
          ) : courseEnrolled ? (
            <BadgeCheck className="h-7 w-7 text-blue-500" />
          ) : (
            <>
              <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />{t("registered")}
              </div>
              {hasCourse && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 whitespace-nowrap"
                  disabled={enrolling} onClick={enrol}>
                  {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                  {t("enrolBtn")}
                </Button>
              )}
            </>
          )}
        </div>
        {err && (
          <p className="flex items-center justify-end gap-1 text-[11px] text-red-600 mt-1">
            <AlertCircle className="h-3 w-3 shrink-0" />{err}
          </p>
        )}
      </td>
    </tr>
  );
}

// ── Lesson Progress Modal ─────────────────────────────────────────────────────

function LessonProgressModal({
  teamId, teamName, courseId, onClose,
}: {
  teamId: string; teamName: string; courseId: string; onClose: () => void;
}) {
  const t = useTranslations("lms");
  const [data,    setData]    = useState<LessonProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  useEffect(() => {
    fetch(`/api/v2/manager/teams/${teamId}/lms/lesson-progress?courseId=${encodeURIComponent(courseId)}`)
      .then(r => r.json())
      .then(j => {
        if (j.data) setData(j.data);
        else setErr("No data available");
      })
      .catch(() => setErr("Failed to load"))
      .finally(() => setLoading(false));
  }, [teamId, courseId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-indigo-500" />
            {t("reviewProgressTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">{teamName}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : err ? (
            <p className="text-sm text-red-500 text-center py-6">{err}</p>
          ) : data ? (
            <>
              {/* Summary strip */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border text-sm">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {data.completedLessonCount}/{data.lessonCount}
                </span>
                <span className="text-zinc-500">{t("lessonsCompleted")}</span>
                <span className="ml-auto font-mono text-indigo-600">{data.completionPercent}%</span>
              </div>
              {/* Chapter list */}
              {data.chapters.map(ch => (
                <div key={ch.id} className="space-y-1">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide px-1">
                    {ch.title}
                    <span className="ml-1.5 font-normal normal-case">
                      ({ch.completedLessonCount}/{ch.lessonCount})
                    </span>
                  </p>
                  {ch.lessons.map(ls => (
                    <div key={ls.id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm ${
                        ls.completed
                          ? "bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30"
                          : "bg-white dark:bg-zinc-900 border dark:border-zinc-800"
                      }`}>
                      {ls.completed
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                        : <div className="h-3.5 w-3.5 rounded-full border-2 border-zinc-300 dark:border-zinc-600 mt-0.5 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${ls.completed ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}>
                          {ls.title}
                        </p>
                        {!ls.completed && ls.pendingPages && ls.pendingPages.length > 0 && (
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {t("pendingPages")}: {ls.pendingPages.map(p => p.title).join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0 mt-0.5">
                        {ls.completedPageCount}/{ls.pageCount}p
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("credsDone")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main BengkelClient ─────────────────────────────────────────────────────────

export function BengkelClient() {
  const t = useTranslations("lms");
  const [teams,           setTeams]           = useState<Team[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loginStats,    setLoginStats]    = useState<Record<string, StatsEntry>>({});
  const [progressStats, setProgressStats] = useState<Record<string, ProgressEntry>>({});
  const [creds,           setCreds]           = useState<{ teamId: string; teamName: string; data: Credentials } | null>(null);
  const [lessonProgressModal, setLessonProgressModal] = useState<{ teamId: string; teamName: string; courseId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/manager/teams");
      const j   = await res.json();
      const fetched: Team[] = j.data ?? [];
      setTeams(fetched);

      // Sync enrollment status for registered teams whose DB flag may be stale
      const toSync = fetched.filter(
        t => t.lmsUserId && t.competition.eptimEduCourseId && !t.lmsCourseEnrolled
      );
      if (toSync.length > 0) {
        const results = await Promise.allSettled(
          toSync.map(t =>
            fetch(`/api/v2/manager/teams/${t.id}/lms/enrol`, { method: "POST" })
              .then(r => ({ id: t.id, ok: r.ok }))
          )
        );
        const enrolledIds = new Set(
          results
            .filter((r): r is PromiseFulfilledResult<{ id: string; ok: boolean }> => r.status === "fulfilled" && r.value.ok)
            .map(r => r.value.id)
        );
        if (enrolledIds.size > 0) {
          setTeams(prev => prev.map(t => enrolledIds.has(t.id) ? { ...t, lmsCourseEnrolled: true } : t));
        }
      }

      // Fetch login stats and submission status for enrolled teams (in parallel)
      const enrolled = fetched.filter(t => t.lmsUserId);

      // All (teamId, courseId) pairs to fetch progress for
      const progressPairs = enrolled.flatMap(t =>
        t.courses.map(c => ({ teamId: t.id, courseId: c.courseId }))
      );

      const [statsResults, subResults] = await Promise.all([
        enrolled.length > 0
          ? Promise.allSettled(
              enrolled.map(t =>
                fetch(`/api/v2/manager/teams/${t.id}/lms`)
                  .then(r => r.json())
                  .then(j => ({ id: t.id, data: (j.data ?? null) as StatsEntry }))
              )
            )
          : Promise.resolve([]),
        progressPairs.length > 0
          ? Promise.allSettled(
              progressPairs.map(({ teamId, courseId }) =>
                fetch(`/api/v2/manager/teams/${teamId}/lms/progress?courseId=${encodeURIComponent(courseId)}`)
                  .then(r => r.json())
                  .then(j => ({ key: progKey(teamId, courseId), data: (j.data ?? null) as ProgressEntry }))
              )
            )
          : Promise.resolve([]),
      ]);

      const statsMap: Record<string, StatsEntry> = {};
      for (const r of statsResults) {
        if (r.status === "fulfilled") statsMap[r.value.id] = r.value.data;
      }
      setLoginStats(statsMap);

      const progMap: Record<string, ProgressEntry> = {};
      for (const r of subResults) {
        if (r.status === "fulfilled") progMap[r.value.key] = r.value.data;
      }
      setProgressStats(progMap);
    } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleJoined(teamId: string, data: Credentials) {
    const team = teams.find(t => t.id === teamId);
    if (team) setCreds({ teamId, teamName: team.name, data });
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, lmsUserId: data.username, lmsCourseEnrolled: data.enrolled } : t
    ));
    setLoginStats(prev => ({ ...prev, [teamId]: { loginCount: 0, lastLoginAt: null } }));
    // Initialize progress for all courses
    const joined = teams.find(t => t.id === teamId);
    if (joined) {
      setProgressStats(prev => {
        const next = { ...prev };
        for (const c of joined.courses) {
          next[progKey(teamId, c.courseId)] = { enrolled: false, isComplete: false, completedAt: null, completionPercent: 0, hasSubmission: false, submissionCount: 0, lastSubmittedAt: null };
        }
        return next;
      });
    }
  }

  function handleEnrolled(teamId: string) {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, lmsCourseEnrolled: true } : t));
  }

  function handleReviewProgress(teamId: string, courseId: string) {
    const team = teams.find(t => t.id === teamId);
    if (team) setLessonProgressModal({ teamId, teamName: team.name, courseId });
  }

  // Group by competition
  const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    if (!acc[t.competition.id]) acc[t.competition.id] = [];
    acc[t.competition.id].push(t);
    return acc;
  }, {});

  const enrolledCount = teams.filter(t => t.lmsUserId).length;
  const total         = teams.length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {t("subtitle")}
          {total > 0 && ` ${t("enrolled", { enrolled: enrolledCount, total })}`}
        </p>
      </div>

      <ManagerAccountSection />

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-blue-50 p-4">
            <Trophy className="h-8 w-8 text-blue-400" />
          </div>
          <p className="font-medium">{t("noTeams")}</p>
          <p className="text-sm text-zinc-500">{t("noTeamsDesc")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([, compTeams]) => {
            const comp = compTeams[0].competition;
            return (
              <div key={comp.id} className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 dark:shadow-black/20">
                {/* Competition header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-zinc-50/80 dark:bg-zinc-800/60 dark:border-zinc-800">
                  <Trophy className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{comp.name}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">({comp.code})</span>
                </div>

                {/* Mobile: card list */}
                <div className="md:hidden divide-y dark:divide-zinc-800">
                  {compTeams.map(team => (
                    <TeamRow key={team.id} team={team} stats={loginStats[team.id]} progressData={Object.fromEntries(team.courses.map(c => [c.courseId, progressStats[progKey(team.id, c.courseId)]]))} onJoined={handleJoined} onEnrolled={handleEnrolled} onReviewProgress={handleReviewProgress} />
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50/60 dark:bg-zinc-800/40 border-b dark:border-zinc-800">
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colTeam")}</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colEmail")}</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colLogin")}</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colSubmission")}</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{t("colProgress")}</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-800">
                      {compTeams.map((team, i) => (
                        <TeamTableRow key={team.id} team={team} stats={loginStats[team.id]} progressData={Object.fromEntries(team.courses.map(c => [c.courseId, progressStats[progKey(team.id, c.courseId)]]))} index={i} onJoined={handleJoined} onEnrolled={handleEnrolled} onReviewProgress={handleReviewProgress} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CredentialsDialog
        creds={creds?.data ?? null}
        teamName={creds?.teamName ?? ""}
        onClose={() => setCreds(null)}
      />

      {lessonProgressModal && (
        <LessonProgressModal
          teamId={lessonProgressModal.teamId}
          teamName={lessonProgressModal.teamName}
          courseId={lessonProgressModal.courseId}
          onClose={() => setLessonProgressModal(null)}
        />
      )}
    </div>
  );
}
