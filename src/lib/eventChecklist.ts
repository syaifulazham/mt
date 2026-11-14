import { db } from "@/lib/db";
import { competitionTitle } from "@/lib/competition-split";
import { eventJudgingProgress, walkInJudgingProgress, INTERNATIONAL_SCOPE_ID } from "@/lib/judgingStatus";
import { resolveResultScope, RESULT_SCOPE_LABEL } from "@/lib/resultScope";
import { duelPhase, loadRounds } from "@/lib/duel-server";

// Senarai Semak Pertandingan: where every competition of an event stands, step
// by step, from registration to certificates, plus the event-wide set-up
// (display links, MC board, certificate templates). Read-only: it only counts
// what the other pages manage, and links to them.

export type StepState = "done" | "partial" | "todo" | "na";
export type Step = {
  key: string;
  label: string;
  state: StepState;
  detail: string;
  /** Page under the event's manage path that handles this step. */
  href?: string;
};
export type ChecklistRow = {
  id: string;
  kind: "event" | "walkin";
  code: string;
  name: string;
  /** "Skor" / "Duel" / "Walk-in". */
  method: string;
  participation: string;
  resultScope: string;
  pic: string | null;
  isSplit: boolean;
  steps: Step[];
  /** Done steps / applicable steps, 0–100. */
  percent: number;
  /** Shortcut pages for this competition. */
  links: { label: string; href: string }[];
};
export type EventCheck = { key: string; label: string; state: StepState; detail: string; href: string };
export type EventChecklist = {
  event: { id: string; name: string; slug: string; scope: string };
  rows: ChecklistRow[];
  eventChecks: EventCheck[];
  totals: { competitions: number; walkin: number; complete: number; verified: number; announced: number; percent: number };
};

const ONLINE_SCOPES = ["ONLINE_NATIONAL", "ONLINE_STATE", "ONLINE_ZONE", "ONLINE_OPEN"];
const MEDAL_TALLY_SCOPES = ["NATIONAL", "ONLINE_NATIONAL"];

const frac = (n: number, of: number): StepState => (of > 0 && n >= of ? "done" : n > 0 ? "partial" : "todo");
const percentOf = (steps: { state: StepState }[]) => {
  const live = steps.filter(s => s.state !== "na");
  if (!live.length) return 0;
  const score = live.reduce((a, s) => a + (s.state === "done" ? 1 : s.state === "partial" ? 0.5 : 0), 0);
  return Math.round((score / live.length) * 100);
};

type Lifecycle = { stateId: string | null; stateName: string; judgingStatus: string; total: number; judgedAll: number };

/**
 * Selesai / Disahkan / Diumumkan for one competition: the national result, or
 * every state's (STATE result scope; Antarabangsa counts as a state).
 */
function lifecycleSteps(rows: Lifecycle[], perState: boolean, announced: Set<string>, refId: string, kind: string): Step[] {
  const states = rows.filter(r => r.stateId !== null && r.total > 0);
  if (perState) {
    const n = states.length;
    const done = states.filter(r => r.judgingStatus !== "OPEN").length;
    const ver = states.filter(r => r.judgingStatus === "VERIFIED").length;
    const ann = states.filter(r => announced.has(`${kind}:${refId}:${r.stateId}`)).length;
    return [
      { key: "complete", label: "Selesai dinilai", state: n ? frac(done, n) : "todo", detail: `${done}/${n} negeri`, href: "judging" },
      { key: "verify", label: "Keputusan disahkan", state: n ? frac(ver, n) : "todo", detail: `${ver}/${n} negeri`, href: "judging" },
      { key: "announce", label: "Diumumkan", state: n ? frac(ann, n) : "todo", detail: `${ann}/${n} negeri`, href: "announcements" },
    ];
  }
  const nat = rows.find(r => r.stateId === null);
  const st = nat?.judgingStatus ?? "OPEN";
  // Foreign teams are judged in their own Antarabangsa scope beside the national list.
  const intl = rows.find(r => r.stateId === INTERNATIONAL_SCOPE_ID && r.total > 0);
  const extra = intl ? ` · Antarabangsa ${intl.judgingStatus === "VERIFIED" ? "disahkan" : intl.judgingStatus === "COMPLETED" ? "selesai" : "belum"}` : "";
  const ann = announced.has(`${kind}:${refId}:`);
  return [
    { key: "complete", label: "Selesai dinilai", state: st !== "OPEN" ? "done" : "todo", detail: (st !== "OPEN" ? "Selesai" : "Belum") + extra, href: "judging" },
    { key: "verify", label: "Keputusan disahkan", state: st === "VERIFIED" ? "done" : "todo", detail: st === "VERIFIED" ? "Disahkan" : "Belum", href: "judging" },
    { key: "announce", label: "Diumumkan", state: ann ? "done" : "todo", detail: ann ? "Telah diumumkan" : "Belum", href: "announcements" },
  ];
}

export async function eventChecklist(eventId: string): Promise<EventChecklist | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, slug: true, scope: true } });
  if (!event) return null;
  const online = ONLINE_SCOPES.includes(event.scope);

  const [ecs, wics, entries, progress, wProgress, teamCounts, certCounts, endpoints] = await Promise.all([
    db.eventCompetition.findMany({
      where: { eventId },
      select: {
        id: true, competitionId: true, picName: true, maxTeams: true, judgingMethod: true, duelConfig: true, resultScope: true,
        splitLabel: true, parentId: true, isOnline: true,
        competition: { select: { code: true, name: true, participationType: true } },
        judgingTemplates: { select: { id: true } },
      },
    }),
    db.eventWalkInCompetition.findMany({
      where: { eventId },
      select: {
        id: true, picName: true, maxSlots: true,
        competition: { select: { code: true, name: true, participationType: true } },
        judgingTemplates: { select: { id: true } },
        _count: { select: { registrations: { where: { status: "CONFIRMED" } }, scoreboards: true } },
      },
    }),
    db.announcementEntry.findMany({ where: { eventId, announcedAt: { not: null } }, select: { kind: true, refId: true, stateId: true } }),
    eventJudgingProgress(eventId),
    walkInJudgingProgress(eventId),
    // Per competition: entered teams, accepted, accepted and present (ACTIVE teams only).
    db.$queryRaw<{ competitionId: string; registered: number; accepted: number; attended: number }[]>`
      SELECT t."competitionId",
        COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE te.acceptance = 'ACCEPT')::int AS accepted,
        COUNT(*) FILTER (WHERE te.acceptance = 'ACCEPT' AND (te."attendedAt" IS NOT NULL
          OR EXISTS (SELECT 1 FROM team_event_participant_attendance a WHERE a."teamEventId" = te.id)))::int AS attended
      FROM team_events te JOIN teams t ON t.id = te."teamId"
      WHERE te."eventId" = ${eventId} AND t.status = 'ACTIVE'
      GROUP BY t."competitionId"`,
    db.certificate.groupBy({ by: ["competitionId"], where: { eventId, status: { not: "REVOKED" } }, _count: { _all: true } }),
    Promise.all([
      db.resultsEndpoint.count({ where: { eventId, status: "ACTIVE" } }),
      db.medalTallyEndpoint.count({ where: { eventId, status: "ACTIVE" } }),
      db.announcementEndpoint.count({ where: { eventId, status: "ACTIVE" } }),
      db.attendanceEndpoint.count({ where: { eventId, active: true } }),
      db.certTemplate.count({ where: { eventId, status: "ACTIVE" } }),
      db.duelDisplayEndpoint.count({ where: { eventId, status: "ACTIVE" } }),
    ]),
  ]);

  const announced = new Set(entries.map(e => `${e.kind}:${e.refId}:${e.stateId}`));
  const progBy = new Map(progress.map(p => [p.id, p]));
  const wProgBy = new Map(wProgress.map(p => [p.id, p]));
  const teamsBy = new Map(teamCounts.map(t => [t.competitionId, t]));
  const certsBy = new Map(certCounts.map(c => [c.competitionId, c._count._all]));
  const duelIds = ecs.filter(ec => ec.judgingMethod === "DUEL").map(ec => ec.id);
  const duelBy = new Map(await Promise.all(duelIds.map(async id => {
    const rounds = await loadRounds(id);
    return [id, { phase: duelPhase(rounds), confirmed: rounds.filter(r => r.status !== "DRAFT").length, drafts: rounds.filter(r => r.status === "DRAFT").length }] as const;
  })));

  const rows: ChecklistRow[] = ecs.map(ec => {
    const isSplit = !!ec.parentId;
    const duel = ec.judgingMethod === "DUEL";
    const scope = resolveResultScope(ec, event.scope);
    const t = teamsBy.get(ec.competitionId) ?? { registered: 0, accepted: 0, attended: 0 };
    const p = progBy.get(ec.id);
    const steps: Step[] = [];

    // Registration and attendance belong to the original row; its splits share its teams.
    steps.push(isSplit
      ? { key: "reg", label: "Pendaftaran", state: "na", detail: "Ikut pertandingan induk" }
      : {
          key: "reg", label: "Pendaftaran", href: "preregistration",
          state: t.accepted > 0 ? "done" : t.registered > 0 ? "partial" : "todo",
          detail: `${t.registered} berdaftar · ${t.accepted} diterima${ec.maxTeams ? ` / had ${ec.maxTeams}` : ""}`,
        });
    steps.push(isSplit || online || ec.isOnline
      ? { key: "att", label: "Kehadiran", state: "na", detail: isSplit ? "Ikut pertandingan induk" : "Dalam talian" }
      : { key: "att", label: "Kehadiran", href: "attendance/confirmed", state: t.accepted ? frac(t.attended, t.accepted) : "todo", detail: `${t.attended}/${t.accepted} hadir` });

    if (duel) {
      const d = duelBy.get(ec.id);
      steps.push({ key: "setup", label: "Persediaan duel", href: "judging", state: ec.duelConfig ? "done" : "todo", detail: ec.duelConfig ? "Konfigurasi duel ditetapkan" : "Tetapkan konfigurasi duel" });
      steps.push({
        key: "tasks", label: "Cabutan disahkan", href: `scoreboard/${ec.id}`,
        state: d?.confirmed ? "done" : d?.drafts ? "partial" : "todo",
        detail: d?.confirmed ? `${d.confirmed} pusingan` : d?.drafts ? "Draf cabutan" : "Belum dicabut",
      });
      steps.push({
        key: "scoring", label: "Perlawanan", href: `scoreboard/${ec.id}`,
        state: d?.phase.finished ? "done" : d && d.phase.done > 0 ? "partial" : "todo",
        detail: d?.phase.label ?? "Belum dicabut",
      });
    } else {
      const active = p?.tasks.filter(x => x.status === "ACTIVE").length ?? 0;
      const nat = p?.rows[0];
      const total = (p?.rows ?? []).filter(r => r.stateId !== null).reduce((a, r) => a + r.total, 0) || (nat?.total ?? 0);
      const judged = (p?.rows ?? []).filter(r => r.stateId !== null).reduce((a, r) => a + r.judgedAll, 0) || (nat?.judgedAll ?? 0);
      steps.push({ key: "setup", label: "Templat penilaian", href: "judging", state: ec.judgingTemplates.length ? "done" : "todo", detail: ec.judgingTemplates.length ? `${ec.judgingTemplates.length} templat` : "Tiada templat" });
      steps.push({ key: "tasks", label: "Pautan hakim", href: "judging", state: active ? "done" : "todo", detail: active ? `${active} pautan aktif` : "Tiada pautan" });
      steps.push({ key: "scoring", label: "Pemarkahan", href: "judging", state: active ? frac(judged, total) : "todo", detail: `${judged}/${total} dinilai penuh` });
    }

    steps.push(...lifecycleSteps(p?.rows ?? [], scope === "STATE", announced, ec.id, "event"));
    const certs = certsBy.get(ec.competitionId) ?? 0;
    steps.push(isSplit
      ? { key: "cert", label: "Sijil", state: "na", detail: "Dikira pada pertandingan induk" }
      : { key: "cert", label: "Sijil", href: "/organizer/certificates", state: certs ? "done" : "todo", detail: certs ? `${certs} sijil` : "Belum dijana" });

    return {
      id: ec.id, kind: "event", code: ec.competition.code,
      name: competitionTitle(ec.competition.name, ec.splitLabel),
      method: duel ? "Duel" : "Skor",
      participation: ec.competition.participationType,
      resultScope: RESULT_SCOPE_LABEL[scope],
      pic: ec.picName, isSplit, steps, percent: percentOf(steps),
      links: [
        ...(isSplit ? [] : [{ label: "Pra-pendaftaran", href: "preregistration" }]),
        { label: "Penghakiman", href: "judging" },
        ...(duel ? [{ label: "Urus duel", href: `scoreboard/${ec.id}` }] : []),
        { label: "Keputusan", href: "results" },
      ],
    };
  });

  const wRows: ChecklistRow[] = wics.map(w => {
    const p = wProgBy.get(w.id);
    const regs = w._count.registrations;
    const active = p?.tasks.filter(x => x.status === "ACTIVE").length ?? 0;
    const nat = p?.rows[0];
    const steps: Step[] = [
      { key: "reg", label: "Pendaftaran walk-in", href: "walkin", state: regs ? "done" : "todo", detail: `${regs} disahkan${w.maxSlots ? ` / slot ${w.maxSlots}` : ""}` },
      { key: "setup", label: "Templat penilaian", href: "walkin/judging", state: w.judgingTemplates.length ? "done" : "todo", detail: w.judgingTemplates.length ? `${w.judgingTemplates.length} templat` : "Tiada templat" },
      { key: "tasks", label: "Pautan hakim", href: "walkin/judging", state: active ? "done" : "todo", detail: active ? `${active} pautan aktif` : "Tiada pautan" },
      { key: "scoring", label: "Pemarkahan", href: "walkin/judging", state: active ? frac(nat?.judgedAll ?? 0, nat?.total ?? 0) : "todo", detail: `${nat?.judgedAll ?? 0}/${nat?.total ?? 0} dinilai penuh` },
      ...lifecycleSteps(p?.rows ?? [], false, announced, w.id, "walkin").map(s => s.key === "announce" ? s : { ...s, href: "walkin/judging" }),
    ];
    return {
      id: w.id, kind: "walkin", code: w.competition.code, name: w.competition.name,
      method: "Walk-in", participation: w.competition.participationType, resultScope: RESULT_SCOPE_LABEL.NATIONAL,
      pic: w.picName, isSplit: false, steps, percent: percentOf(steps),
      links: [
        { label: "Walk-in", href: "walkin" },
        { label: "Penghakiman", href: "walkin/judging" },
        { label: "Keputusan", href: "walkin/results" },
      ],
    };
  });

  const byCode = (a: ChecklistRow, b: ChecklistRow) => a.code.localeCompare(b.code, undefined, { numeric: true }) || Number(a.isSplit) - Number(b.isSplit) || a.name.localeCompare(b.name);
  rows.sort(byCode); wRows.sort(byCode);
  const all = [...rows, ...wRows];

  const [resultsN, medalN, announceN, attendN, certTplN, duelDispN] = endpoints;
  const noPic = rows.filter(r => !r.isSplit && !r.pic).length + wRows.filter(r => !r.pic).length;
  const eventChecks: EventCheck[] = [
    { key: "comps", label: "Pertandingan ditambah", href: "/organizer/events", state: all.length ? "done" : "todo", detail: `${rows.length} pertandingan · ${wRows.length} walk-in` },
    { key: "pic", label: "PIC setiap pertandingan", href: "/organizer/events", state: all.length ? (noPic === 0 ? "done" : noPic < all.length ? "partial" : "todo") : "todo", detail: noPic ? `${noPic} tiada PIC` : "Lengkap" },
    ...(online ? [] : [{ key: "attend", label: "Pautan log kehadiran", href: "attendance", state: (attendN ? "done" : "todo") as StepState, detail: attendN ? `${attendN} pautan aktif` : "Belum dicipta" }]),
    { key: "results", label: "Paparan keputusan awam", href: "results", state: resultsN ? "done" : "todo", detail: resultsN ? `${resultsN} pautan aktif` : "Belum dicipta" },
    ...(MEDAL_TALLY_SCOPES.includes(event.scope) ? [{ key: "medal", label: "Paparan Medal Tally", href: "results/medals", state: (medalN ? "done" : "todo") as StepState, detail: medalN ? `${medalN} pautan aktif` : "Belum dicipta" }] : []),
    { key: "mc", label: "Papan MC (pengumuman)", href: "announcements", state: announceN ? "done" : "todo", detail: announceN ? `${announceN} papan aktif` : "Belum dicipta" },
    ...(duelIds.length ? [{ key: "duel", label: "Paparan awam duel", href: "scoreboard", state: (duelDispN ? "done" : "todo") as StepState, detail: duelDispN ? `${duelDispN} pautan aktif` : "Belum dicipta" }] : []),
    { key: "cert", label: "Templat sijil acara", href: "/organizer/certificates", state: certTplN ? "done" : "todo", detail: certTplN ? `${certTplN} templat aktif` : "Tiada templat aktif untuk acara ini" },
  ];

  const stepDone = (r: ChecklistRow, key: string) => r.steps.find(s => s.key === key)?.state === "done";
  return {
    event,
    rows: [...rows, ...wRows],
    eventChecks,
    totals: {
      competitions: rows.length, walkin: wRows.length,
      complete: all.filter(r => stepDone(r, "complete")).length,
      verified: all.filter(r => stepDone(r, "verify")).length,
      announced: all.filter(r => stepDone(r, "announce")).length,
      percent: percentOf([...all.flatMap(r => r.steps), ...eventChecks]),
    },
  };
}
