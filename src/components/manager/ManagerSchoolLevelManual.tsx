"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, Download, Info, Loader2, School, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CertIcon } from "@/components/manager/ManagerCertificatesClient";

// Manager portal → Sijil → School Level Cert → Manual. A step-by-step guide.
// The "snapshots" are static mockups drawn with the portal's own styles and
// labels (illustrations, not live data); a numbered marker points at the
// control each step is about.

/** A browser-like frame around a mockup. */
function Shot({ path, children, className }: { path: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-950", className)} aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-2 truncate rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">techlympics.my{path}</span>
      </div>
      <div className="pointer-events-none select-none p-3 sm:p-4">{children}</div>
    </figure>
  );
}

/** Numbered marker that points at a control in a mockup. */
function Pin({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold text-white shadow ring-4 ring-rose-500/25", className)}>{n}</span>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  const t = useTranslations("schoolLevelManual");
  return (
    <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] dark:border-zinc-800">
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">{t("step", { n })}</p>
        <h2 className="text-lg font-bold leading-snug text-zinc-900 dark:text-zinc-100">{title}</h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const PEOPLE = [
  { name: "AHMAD DANIAL BIN ROSLI",    cls: "Tahun 5 Bestari", reg: true,  via: "Robo Bestari A", issued: false },
  { name: "NUR AISYAH BINTI KAMAL",    cls: "Tahun 5 Bestari", reg: true,  via: "Robo Bestari A", issued: false },
  { name: "LIM WEI JIE",               cls: "Tahun 6 Cemerlang", reg: true, via: "Walk-in",       issued: true },
  { name: "SITI HAJAR BINTI ZULKIFLI", cls: "Tahun 4 Gemilang", reg: false, via: "",              issued: false },
];

export function ManagerSchoolLevelManual() {
  const t = useTranslations("schoolLevelManual");
  const m = useTranslations("managerCertificates");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link href="/manager/certificates/school-level" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"><BookOpen className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-balance dark:text-zinc-100">{t("title")}</h1>
            <p className="max-w-2xl text-sm text-zinc-500">{t("subtitle")}</p>
          </div>
          <Link href="/manager/certificates/school-level"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            {t("openPage")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── Before you start ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-200"><Info className="h-4 w-4" /> {t("before")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900/90 dark:text-sky-100/80">
          <li>{t("before1")}</li><li>{t("before2")}</li><li>{t("before3")}</li>
        </ul>
      </div>

      <div className="space-y-8 rounded-2xl border bg-white p-5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {/* 1 — the card on Sijil */}
        <Step n={1} title={t("s1Title")} body={t("s1Body")}>
          <Shot path="/manager/certificates">
            <p className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">{m("title")}</p>
            <div className="relative flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><School className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold tracking-wide text-zinc-900 dark:text-zinc-100">{m("generalTitleSchool")}</p>
                <p className="line-clamp-2 text-[11px] text-zinc-500">{m("generalIntro")}</p>
              </div>
              <span className="relative inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white ring-4 ring-rose-400/40">
                {m("openGeneral")} <ArrowRight className="h-3.5 w-3.5" />
                <Pin n={1} className="-right-3 -top-3" />
              </span>
            </div>
            <div className="mt-2 h-14 rounded-xl border border-dashed bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60" />
          </Shot>
        </Step>

        {/* 2 — competitions */}
        <Step n={2} title={t("s2Title")} body={t("s2Body")}>
          <Shot path="/manager/certificates/school-level">
            <div className="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <div className="rounded-lg border bg-white p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-1 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] text-zinc-400 dark:border-zinc-700"><Search className="h-3 w-3" /> {t("mockSearch")}</div>
                {[["2.2KB", "Cabaran EZBOT", 12, 180, 0], ["3.1K", "Cabaran Dron Xventure", 4, 180, 0], ["5.1K", "Cabaran Rekabentuk 3D", 3, 120, 3]].map(([code, name, reg, el, iss], i) => (
                  <div key={code as string} className={cn("relative flex gap-2 rounded-md border p-1.5", i === 0 ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-transparent")}>
                    <span className="w-9 shrink-0 font-mono text-[10px] text-zinc-500">{code}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium text-zinc-900 dark:text-zinc-100">{name}</span>
                      <span className="block text-[10px] text-zinc-500">{m("competitionCounts", { registered: reg as number, eligible: el as number, issued: iss as number })}</span>
                    </span>
                    {i === 0 && <Pin n={2} className="-right-2.5 -top-2.5" />}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center rounded-lg border border-dashed bg-white/60 p-4 text-center text-[11px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60">{m("pickCompetitionHint")}</div>
            </div>
          </Shot>
        </Step>

        {/* 3 — participants */}
        <Step n={3} title={t("s3Title")} body={t("s3Body")}>
          <Shot path="/manager/certificates/school-level">
            <div className="overflow-hidden rounded-lg border bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2 text-[10px] dark:border-zinc-800">
                <span className="rounded border px-2 py-0.5 font-medium dark:border-zinc-700">{m("selectAll")}</span>
                <span className="relative rounded border px-2 py-0.5 font-medium dark:border-zinc-700">{m("selectRegistered")}<Pin n={3} className="-right-3 -top-3 h-5 w-5 text-[10px]" /></span>
                <span className="px-1 text-zinc-500">{m("clearSelection")}</span>
                <span className="ml-auto text-zinc-500">{m("selectedCount", { count: 2 })}</span>
              </div>
              <table className="w-full text-[11px]">
                <tbody className="divide-y dark:divide-zinc-800">
                  {PEOPLE.map(p => (
                    <tr key={p.name} className={cn(p.issued ? "text-zinc-400" : "", p.reg && !p.issued && "bg-emerald-50/70 dark:bg-emerald-950/30")}>
                      <td className="w-8 px-2 py-1.5">
                        <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-sm border",
                          p.issued ? "border-zinc-300 bg-zinc-300" : p.reg ? "border-emerald-600 bg-emerald-600" : "border-zinc-400 bg-white")}>
                          {(p.reg || p.issued) && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white"><path d="M2.5 6.5l2.2 2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium">{p.name}</td>
                      <td className="hidden px-2 py-1.5 text-zinc-500 sm:table-cell">{p.cls}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex flex-wrap items-center gap-1">
                          {p.reg
                            ? <span className="rounded bg-emerald-50 px-1 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40">{m("registeredBadge")}</span>
                            : <span className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-500 dark:bg-zinc-800">{m("eligibleOnly")}</span>}
                          {p.via && <span className="text-zinc-500">{p.via}</span>}
                          {p.issued && <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800">{m("alreadyIssued")}</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Shot>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-2"><span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-emerald-600" /> {t("s3Legend1")}</li>
            <li className="flex gap-2"><span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-zinc-400 bg-white" /> {t("s3Legend2")}</li>
            <li className="flex gap-2"><span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-zinc-300" /> {t("s3Legend3")}</li>
            <li className="flex gap-2 text-zinc-500"><Info className="mt-0.5 h-3 w-3 shrink-0" /> {t("s3Tip")}</li>
          </ul>
        </Step>

        {/* 4 — generate */}
        <Step n={4} title={t("s4Title")} body={t("s4Body")}>
          <Shot path="/manager/certificates/school-level">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="relative inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white ring-4 ring-rose-400/40">
                <Sparkles className="h-3.5 w-3.5" /> {t("mockGenerate", { count: 3 })}
                <Pin n={4} className="-right-3 -top-3" />
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-600">
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white"><path d="M2.5 6.5l2.2 2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </span>
                {m("downloadWhenDone")}
              </span>
            </div>
          </Shot>
        </Step>

        {/* 5 — progress */}
        <Step n={5} title={t("s5Title")} body={t("s5Body")}>
          <Shot path="/manager/certificates/school-level">
            <div className="space-y-2 rounded-lg border bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"><div className="h-full w-2/3 rounded-full bg-emerald-500" /></div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                <Loader2 className="h-3.5 w-3.5" /> {m("stepIssuing", { done: 2, total: 3 })}
              </p>
              <ul className="grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
                {[["AHMAD DANIAL BIN ROSLI", "CREATED"], ["NUR AISYAH BINTI KAMAL", "CREATED"], ["SITI HAJAR BINTI ZULKIFLI", "QUEUED"]].map(([n, s]) => (
                  <li key={n} className="flex items-center gap-1.5">
                    {s === "CREATED" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-zinc-400" />}
                    <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{n}</span>
                    <span className={cn("text-[10px]", s === "CREATED" ? "text-emerald-600" : "text-zinc-400")}>{s === "CREATED" ? m("statusCreated") : m("statusQueued")}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {t("mockDone")}</span>
              <span className="relative ml-auto inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white">
                <Download className="h-3.5 w-3.5" /> {m("downloadGenerated", { count: 3 })}
                <Pin n={5} className="-right-3 -top-3" />
              </span>
            </div>
          </Shot>
        </Step>

        {/* 6 — results on Sijil */}
        <Step n={6} title={t("s6Title")} body={t("s6Body")}>
          <Shot path="/manager/certificates">
            <div className="overflow-hidden rounded-lg border bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-[11px]">
                <thead className="border-b bg-zinc-50 text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{m("colName")}</th>
                    <th className="relative px-2 py-1.5 text-center ring-2 ring-inset ring-rose-400/50">{m("levelSchool")}</th>
                    <th className="hidden px-2 py-1.5 text-center sm:table-cell">{m("levelState")}</th>
                    <th className="hidden px-2 py-1.5 text-center sm:table-cell">{m("levelNational")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-zinc-800">
                  {PEOPLE.slice(0, 2).map((p, i) => (
                    <tr key={p.name}>
                      <td className="relative px-2 py-2 font-medium text-blue-700 underline decoration-dotted underline-offset-2">
                        {p.name}{i === 0 && <Pin n={6} className="-left-1 -top-2 h-5 w-5 text-[10px]" />}
                      </td>
                      <td className="px-2 py-2"><span className="flex justify-center"><CertIcon kind="PARTICIPATION" className="h-8 w-7" /></span></td>
                      <td className="hidden px-2 py-2 sm:table-cell" /><td className="hidden px-2 py-2 sm:table-cell" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Shot>
        </Step>
      </div>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{t("faq")}</h2>
        {(["1", "2", "3", "4"] as const).map(k => (
          <details key={k} className="group rounded-lg border bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer list-none text-sm font-medium text-zinc-800 marker:hidden dark:text-zinc-100">
              <span className="mr-2 inline-block text-zinc-400 transition-transform group-open:rotate-90">›</span>{t(`q${k}`)}
            </summary>
            <p className="mt-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">{t(`a${k}`)}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
