import { getTranslations } from "next-intl/server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CalendarDays, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { ShowAllCompetitionsToggle } from "@/components/manager/ShowAllCompetitionsToggle";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Individual" };

const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
const ZONE_SCOPES  = ["ZONE", "ONLINE_ZONE"];

const ACCEPTANCE_STYLE: Record<string, string> = {
  ACCEPT:  "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
  HOLD:    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  REJECT:  "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900",
};

/**
 * Individual competitions, per event, with the manager's registered participants.
 *
 * The data model only has teams, so an individual entry is a one-person team in
 * an INDIVIDUAL competition joined to the event (see src/lib/individualEntry.ts)
 * — created by an Asia Spark token, an FC-1 challenge registration, or a manager.
 * This page reads them back as people rather than as "teams".
 */
export default async function ManagerIndividualsPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { locale } = await params;
  // Competitions nobody from the contingent has entered are hidden unless ?all=1.
  const showAll = (await searchParams).all === "1";
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const t = await getTranslations("individuals");

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        // ACTIVE only — PENDING/REJECTED rows are join requests, and this page
        // lists participants by name.
        where: { status: "ACTIVE" },
        include: {
          contingent: {
            select: { id: true, name: true, contingentType: true, stateId: true, school: { select: { stateId: true } } },
          },
        },
      },
    },
  });
  if (!manager?.profileComplete) redirect("/manager/onboarding");

  const contingents   = manager.contingentManagers.map((cm) => cm.contingent);
  const contingentIds = contingents.map((c) => c.id);
  // Effective state per contingent — SCHOOL contingents take their school's state.
  const contingentStates = new Set(
    contingents
      .map((c) => (c.contingentType === "SCHOOL" ? c.school?.stateId : c.stateId))
      .filter((s): s is string => !!s),
  );

  const events = await db.event.findMany({
    where: {
      status: { notIn: ["DRAFT", "ARCHIVE", "CANCELLED"] },
      eventCompetitions: { some: { competition: { participationType: "INDIVIDUAL" } } },
    },
    select: {
      id: true, name: true, status: true, scope: true, stateId: true, zoneId: true,
      startDate: true, endDate: true,
      eventCompetitions: {
        where:   { competition: { participationType: "INDIVIDUAL" } },
        select:  { competition: { select: { id: true, code: true, name: true } } },
        orderBy: { competition: { code: "asc" } },
      },
      teamEvents: {
        where: {
          team: { contingentId: { in: contingentIds }, competition: { participationType: "INDIVIDUAL" } },
        },
        select: {
          acceptance: true,
          createdAt:  true,
          team: {
            select: {
              competitionId: true,
              contingent: { select: { name: true } },
              members: {
                select: { participant: { select: { id: true, name: true, classGrade: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Same location rule as the manager Events API: STATE/ZONE events are only
  // shown to contingents in that state/zone — unless the contingent already has
  // entries there, which must never be hidden.
  const zoneIds = [...new Set(events.filter((e) => ZONE_SCOPES.includes(e.scope) && e.zoneId).map((e) => e.zoneId!))];
  const zoneStates = zoneIds.length === 0 ? [] : await db.zoneState.findMany({
    where: { zoneId: { in: zoneIds } }, select: { zoneId: true, stateId: true },
  });
  const inScope = (e: (typeof events)[number]) => {
    if (STATE_SCOPES.includes(e.scope)) return !!e.stateId && contingentStates.has(e.stateId);
    if (ZONE_SCOPES.includes(e.scope))
      return zoneStates.some((zs) => zs.zoneId === e.zoneId && contingentStates.has(zs.stateId));
    return true;
  };

  const sections = events
    .filter((e) => e.teamEvents.length > 0 || inScope(e))
    .map((e) => ({
      ...e,
      competitions: e.eventCompetitions.map(({ competition }) => ({
        ...competition,
        entries: e.teamEvents
          .filter((te) => te.team.competitionId === competition.id)
          .flatMap((te) => te.team.members.map((m) => ({
            participant: m.participant,
            contingent:  te.team.contingent.name,
            acceptance:  te.acceptance,
            createdAt:   te.createdAt,
          })))
          .sort((a, b) => a.participant.name.localeCompare(b.participant.name)),
      })),
    }));

  const showContingent = contingents.length > 1;
  const dateFmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" });
  const fmt = (d: Date | null) => (d ? dateFmt.format(d) : null);
  const label = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[#085782]" />{t("title")}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("subtitle")}</p>
        </div>
        {sections.length > 0 && <ShowAllCompetitionsToggle checked={showAll} label={t("showAll")} />}
      </div>

      {sections.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t("noEvents")}
        </div>
      )}

      {sections.map((event) => {
        const total   = event.competitions.reduce((n, c) => n + c.entries.length, 0);
        const visible = showAll ? event.competitions : event.competitions.filter((c) => c.entries.length > 0);
        const hidden  = event.competitions.length - visible.length;
        const start = fmt(event.startDate);
        const end   = fmt(event.endDate);
        return (
          <section key={event.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{event.name}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {(start || end) && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {start === end ? start : `${start ?? "?"} – ${end ?? "?"}`}
                    </span>
                  )}
                  <span>{t("competitions", { count: event.competitions.length })}</span>
                  <span className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-px">
                    {label(`status.${event.status}`, event.status)}
                  </span>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-[#085782]/10 text-[#085782] dark:bg-blue-950/40 dark:text-blue-400 px-2.5 py-1 text-xs font-medium">
                {t("registered", { count: total })}
              </span>
            </header>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {visible.length === 0 && (
                <p className="px-5 py-4 text-xs text-zinc-400 italic">{t("noEntries")}</p>
              )}
              {visible.map((comp) => (
                <div key={comp.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 min-w-0 truncate">
                      <span className="font-mono text-xs text-zinc-400 mr-1.5">{comp.code}</span>
                      {comp.name}
                    </h3>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {t("registered", { count: comp.entries.length })}
                    </span>
                  </div>

                  {comp.entries.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">{t("noEntries")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                            <th className="py-1.5 pr-3 font-medium w-8">#</th>
                            <th className="py-1.5 pr-3 font-medium">{t("colName")}</th>
                            <th className="py-1.5 pr-3 font-medium">{t("colClass")}</th>
                            {showContingent && <th className="py-1.5 pr-3 font-medium">{t("colContingent")}</th>}
                            <th className="py-1.5 pr-3 font-medium">{t("colRegistered")}</th>
                            <th className="py-1.5 font-medium">{t("colStatus")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                          {comp.entries.map((entry, i) => (
                            <tr key={entry.participant.id} className="text-zinc-700 dark:text-zinc-300">
                              <td className="py-1.5 pr-3 text-xs text-zinc-400">{i + 1}</td>
                              <td className="py-1.5 pr-3 font-medium">{entry.participant.name}</td>
                              <td className="py-1.5 pr-3 text-xs">{entry.participant.classGrade ?? "—"}</td>
                              {showContingent && <td className="py-1.5 pr-3 text-xs">{entry.contingent}</td>}
                              <td className="py-1.5 pr-3 text-xs text-zinc-500">{fmt(entry.createdAt)}</td>
                              <td className="py-1.5">
                                <span className={`inline-block rounded-full border px-2 py-px text-[11px] ${ACCEPTANCE_STYLE[entry.acceptance] ?? ACCEPTANCE_STYLE.HOLD}`}>
                                  {label(`acceptance.${entry.acceptance}`, entry.acceptance)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!showAll && hidden > 0 && (
              <p className="px-5 py-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400">
                {t("hiddenCount", { count: hidden })}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
