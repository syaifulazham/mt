import { db } from "@/lib/db";
import {
  csiListCaseResults, csiListCompetitionCases, csiListCompetitionRegistrations, type CsiResult,
} from "@/lib/eptim-csi";

// Organizer monitoring of an event's Eptim CSI competitions ("Pantauan
// Pertandingan Dalam Talian → Eptim CSI"): for each event-competition linked to
// a CSI competition, the teams registered on each configured case, with their
// progress on it. CSI is asked per competition (all registrations, paged) and
// per case (all runs, paged) — never per team.

type CaseRef = { id: string; slug: string; title: string };

export type CsiCaseProgress = {
  /** Best run to report: the ranked (first) run, else the latest. */
  status: CsiResult["status"];
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  completedAt: string | null;
  runs: number;
};

export type CsiMonitorTeam = {
  teamId: string;
  teamName: string;
  contingentName: string;
  stateName: string | null;
  csiUserId: string;
  alias: string | null;
  /** caseId → registration time */
  registeredAt: Record<string, string>;
  /** caseId → progress (absent = not started) */
  progress: Record<string, CsiCaseProgress>;
};

export type CsiMonitorCompetition = {
  ecId: string;
  code: string;
  name: string;
  csiCompetitionId: string;
  csiCompetitionName: string | null;
  /** Cases the organizer configured; `inCompetition` false = no longer attached in CSI. */
  cases: (CaseRef & { inCompetition: boolean; registered: number })[];
  /** Teams registered on at least one configured case. */
  teams: CsiMonitorTeam[];
  teamsInEvent: number;
  teamsWithAccount: number;
  error: string | null;
};

function bestRun(runs: CsiResult[]): CsiCaseProgress {
  const ranked = runs.find(r => r.ranked);
  const pick = ranked ?? runs[0]; // runs come newest first
  return {
    status: pick.status, score: pick.score, maxScore: pick.max_score ?? pick.case.max_score,
    startedAt: pick.started_at, completedAt: pick.completed_at, runs: runs.length,
  };
}

export async function csiMonitor(eventId: string): Promise<CsiMonitorCompetition[]> {
  const ecs = await db.eventCompetition.findMany({
    where:  { eventId, eptimCsiCompetitionId: { not: null } },
    select: {
      id: true, competitionId: true, eptimCsiCompetitionId: true, eptimCsiCompetitionName: true, eptimCsiCases: true,
      competition: { select: { code: true, name: true } },
    },
    orderBy: { competition: { code: "asc" } },
  });

  return Promise.all(ecs.map(async (ec): Promise<CsiMonitorCompetition> => {
    const cases = ((ec.eptimCsiCases as CaseRef[] | null) ?? []);
    const teams = await db.team.findMany({
      where: { competitionId: ec.competitionId, teamEvents: { some: { eventId } } },
      select: {
        id: true, name: true, csiAccess: { select: { csiUserId: true, csiAlias: true } },
        contingent: {
          select: {
            name: true,
            state: { select: { name: true } },
            school: { select: { state: { select: { name: true } } } },
            higherInstitution: { select: { state: { select: { name: true } } } },
          },
        },
      },
    });
    const byUser = new Map(teams.filter(t => t.csiAccess).map(t => [t.csiAccess!.csiUserId, t]));
    const base: CsiMonitorCompetition = {
      ecId: ec.id, code: ec.competition.code, name: ec.competition.name,
      csiCompetitionId: ec.eptimCsiCompetitionId!, csiCompetitionName: ec.eptimCsiCompetitionName,
      cases: cases.map(c => ({ ...c, inCompetition: true, registered: 0 })),
      teams: [], teamsInEvent: teams.length, teamsWithAccount: byUser.size, error: null,
    };
    if (cases.length === 0) return base;

    try {
      const [regs, compCases, ...resultsByCase] = await Promise.all([
        csiListCompetitionRegistrations(ec.eptimCsiCompetitionId!),
        csiListCompetitionCases(ec.eptimCsiCompetitionId!).catch(() => null),
        ...cases.map(c => csiListCaseResults(c.slug).catch(() => [] as CsiResult[])),
      ]);
      const attached = compCases ? new Set(compCases.cases.map(c => c.id)) : null;
      const caseIds = new Set(cases.map(c => c.id));

      const rows = new Map<string, CsiMonitorTeam>();
      for (const r of regs) {
        const t = byUser.get(r.user_id);
        if (!t || !caseIds.has(r.case.id)) continue; // another event's team, or an unconfigured case
        const row = rows.get(t.id) ?? {
          teamId: t.id, teamName: t.name, contingentName: t.contingent.name,
          stateName: t.contingent.state?.name ?? t.contingent.school?.state?.name ?? t.contingent.higherInstitution?.state?.name ?? null,
          csiUserId: r.user_id, alias: r.alias ?? t.csiAccess?.csiAlias ?? null,
          registeredAt: {}, progress: {},
        };
        row.registeredAt[r.case.id] = r.created_at;
        rows.set(t.id, row);
      }
      cases.forEach((c, i) => {
        const byPlayer = new Map<string, CsiResult[]>();
        for (const run of resultsByCase[i]) byPlayer.set(run.user_id, [...(byPlayer.get(run.user_id) ?? []), run]);
        for (const row of rows.values()) {
          const runs = byPlayer.get(row.csiUserId);
          if (runs?.length && row.registeredAt[c.id]) row.progress[c.id] = bestRun(runs);
        }
      });

      const teamsOut = [...rows.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
      return {
        ...base,
        cases: cases.map(c => ({
          ...c,
          inCompetition: attached ? attached.has(c.id) : true,
          registered: teamsOut.filter(t => t.registeredAt[c.id]).length,
        })),
        teams: teamsOut,
      };
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      // An older CSI answers the list mode with 400 "user_id query parameter is required".
      const msg = err.status === 400 && /user_id/.test(err.message ?? "")
        ? "Eptim CSI belum menyokong senarai pendaftaran (perlu dikemas kini)."
        : err.status === 401 ? "Kunci API Eptim CSI ditolak (EPTIMCSI_API_KEY)."
        : (err.message ?? "Sambungan ke Eptim CSI gagal.");
      return { ...base, error: msg };
    }
  }));
}

/** Does the event have a competition linked to Eptim CSI? (manage-page card) */
export async function eventHasCsi(eventSlug: string): Promise<boolean> {
  const n = await db.eventCompetition.count({
    where: { event: { slug: eventSlug }, eptimCsiCompetitionId: { not: null } },
  });
  return n > 0;
}
