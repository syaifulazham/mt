"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Award, Download, ExternalLink, FileText, GraduationCap, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CertIcon } from "@/components/manager/ManagerCertificatesClient";

// Manager portal → Sijil → one person: their certificates listed on the left
// (newest season first), the selected one previewed as its PDF on the right.

export type ViewerCert = {
  id: string; serialNumber: string; title: string;
  kind: "PARTICIPATION" | "ACHIEVEMENT" | "TRAINER"; online: boolean; walkIn?: boolean;
  /** managerCertificates message key of the distribution level, if any. */
  levelKey: string | null;
  eventName: string | null; seasonYear: number;
};

export function ManagerCertViewer({ kind, personId, person, enabled, certs, initialId }: {
  kind: "participant" | "trainer"; personId: string;
  person: { name: string; contingent: string | null; line: string | null };
  enabled: boolean; certs: ViewerCert[]; initialId: string | null;
}) {
  const t = useTranslations("managerCertificates");
  const [selected, setSelected] = useState<string | null>(initialId);
  const current = certs.find(c => c.id === selected) ?? null;

  function pick(id: string) {
    setSelected(id);
    // Keep the choice in the address so the page can be reloaded or shared with a colleague.
    const u = new URL(window.location.href);
    u.searchParams.set("c", id);
    window.history.replaceState(null, "", u);
  }

  const bySeason = new Map<number, ViewerCert[]>();
  for (const c of certs) bySeason.set(c.seasonYear, [...(bySeason.get(c.seasonYear) ?? []), c]);

  const kindLabel = (c: ViewerCert) =>
    c.kind === "TRAINER" ? t("trainerCertificate") : c.kind === "ACHIEVEMENT" ? t("kindAchievement") : t("kindParticipation");
  const subline = (c: ViewerCert) => [
    kindLabel(c),
    c.levelKey ? t(c.levelKey as "levelSchool") : null,
    c.walkIn ? t("walkIn") : null,
    c.online ? t("online") : null,
    c.eventName,
  ].filter(Boolean).join(" · ");

  const PersonIcon = kind === "trainer" ? GraduationCap : UserRound;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Link href="/manager/certificates" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <PersonIcon className="h-5 w-5 text-zinc-500" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              {kind === "trainer" ? t("trainerLabel") : t("participantLabel")}
            </p>
            <h1 className="text-xl font-bold leading-tight dark:text-zinc-100">{person.name}</h1>
            <p className="text-xs text-zinc-500">{[person.contingent, person.line].filter(Boolean).join(" · ")}</p>
          </div>
          {kind === "participant" && enabled && certs.length > 1 && (
            <a href={`/api/v2/manager/certificates/${personId}/pdf`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              <Download className="h-3.5 w-3.5" /> {t("downloadAll")}
            </a>
          )}
        </div>
      </div>

      {!enabled ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="rounded-full bg-amber-50 p-4 dark:bg-amber-950/30"><Award className="h-8 w-8 text-amber-500" strokeWidth={1.5} /></div>
          <h2 className="text-base font-semibold dark:text-zinc-100">{t("notDistributedTitle")}</h2>
          <p className="max-w-sm text-sm text-zinc-500">{t("notDistributedBody")}</p>
        </div>
      ) : certs.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {t("noCertificates")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* ── Certificates ──────────────────────────────────────────────── */}
          <aside className="min-w-0 rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto">
            <p className="border-b px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-800">{t("certCount", { count: certs.length })}</p>
            <div className="space-y-3 p-2">
              {[...bySeason.entries()].map(([year, list]) => (
                <div key={year} className="space-y-1">
                  {bySeason.size > 1 && (
                    <p className="px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t("season", { year })}</p>
                  )}
                  {list.map(c => (
                    <button key={c.id} type="button" onClick={() => pick(c.id)} aria-current={c.id === selected}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                        c.id === selected
                          ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40"
                          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                      )}>
                      <CertIcon kind={c.kind} online={c.online} walkIn={c.walkIn} small className="h-10 w-8 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">{c.title}</span>
                        <span className="block truncate text-[11px] text-zinc-500">{subline(c)}</span>
                        <span className="block font-mono text-[10px] text-zinc-400">{c.serialNumber}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* ── Preview ───────────────────────────────────────────────────── */}
          <section className="min-w-0 overflow-hidden rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {current ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 dark:border-zinc-800">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{current.title}</p>
                    <p className="truncate text-[11px] text-zinc-500">{subline(current)} · <span className="font-mono">{current.serialNumber}</span></p>
                  </div>
                  <a href={`/api/v2/certificates/${current.id}/download?inline=1`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <ExternalLink className="h-3.5 w-3.5" /> {t("openNewTab")}
                  </a>
                  <a href={`/api/v2/certificates/${current.id}/download`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                    <Download className="h-3.5 w-3.5" /> {t("download")}
                  </a>
                </div>
                <iframe key={current.id} title={current.title}
                  src={`/api/v2/certificates/${current.id}/download?inline=1#view=FitH&toolbar=0`}
                  className="block h-[75vh] w-full bg-zinc-100 dark:bg-zinc-800 lg:h-[calc(100vh-13rem)]" />
                <p className="border-t px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-800">{t("previewHint")}</p>
              </>
            ) : (
              <div className="flex h-80 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                <FileText className="h-8 w-8 text-zinc-300" /> {t("selectCertificate")}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
