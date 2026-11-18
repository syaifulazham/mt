/**
 * General participation certificates ("Penyertaan Umum"), issued by contingent
 * managers from the manager portal: Sijil → School / Contingent Level Cert.
 *
 * The organizer creates one generator with source GENERAL and sets its
 * template (Certificates → Generator). The newest such generator is the active
 * one. Managers pick a competition, tick their participants (eligible by
 * target group, or registered / taking part in it at any level — see
 * generalRoster) and issue — one certificate per (competition, participant),
 * distributed at Peringkat Sekolah.
 * A participant who already has one (under any General template) is not issued
 * a second.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { matchesTargetGroup } from "@/lib/targetGroupMatch";

export const GENERAL_SOURCE = "GENERAL";
/** Participants per issue request: small, so the portal can show progress. */
export const GENERAL_CHUNK = 10;
/** Certificates per merged PDF download. */
export const GENERAL_PDF_MAX = 200;

/** The active General generator with its template, or null when none is set up (or its template can't issue). */
export async function activeGeneralJob() {
  const job = await db.certGeneratorJob.findFirst({ where: { source: GENERAL_SOURCE }, orderBy: { createdAt: "desc" } });
  if (!job) return null;
  const template = await db.certTemplate.findUnique({
    where:  { id: job.templateId },
    select: { id: true, name: true, currentVersionId: true, status: true, season: { select: { archivedAt: true } } },
  });
  if (!template?.currentVersionId || template.season.archivedAt) return null;
  return { job, template };
}

/** General certificates already issued to these contingents: "competitionId:participantId" → certificate id. */
export async function issuedGeneral(contingentIds: string[]): Promise<Map<string, string>> {
  if (!contingentIds.length) return new Map();
  const rows = await db.$queryRaw<{ id: string; k: string }[]>`
    SELECT id, meta->>'genKey' AS k FROM certificates
    WHERE "contingentId" IN (${Prisma.join(contingentIds)}) AND status <> 'REVOKED'
      AND meta->>'genKey' LIKE '%:general:%'`;
  const out = new Map<string, string>();
  for (const r of rows) {
    const m = /:general:([^:]+):([^:]+)$/.exec(r.k ?? "");
    if (m && !out.has(`${m[1]}:${m[2]}`)) out.set(`${m[1]}:${m[2]}`, r.id);
  }
  return out;
}

// ── Roster: who can get a General certificate for which competition ─────────

export type RosterParticipant = {
  id: string; name: string; classLabel: string | null;
  /** Registered or took part in the competition at any level (a team, or a walk-in). */
  registered: boolean;
  /** Teams (or "Walk-in") they took part under. */
  via: string[];
  /** Their General certificate for this competition, if issued. */
  certificateId: string | null;
};
export type RosterCompetition = { id: string; code: string; name: string; participants: RosterParticipant[] };

/**
 * Every competition of the manager's contingents with its participants:
 * those eligible by the competition's target groups (matchesTargetGroup, the
 * rule registration uses) and those registered or participating in it at any
 * level — a team of that competition, at any event, or a walk-in
 * registration. A competition with no target groups lists its registered
 * participants only. Competitions with nobody are left out.
 */
export async function generalRoster(contingentIds: string[]): Promise<RosterCompetition[]> {
  if (!contingentIds.length) return [];
  const [people, competitions, teams, walkIns, issued] = await Promise.all([
    db.participant.findMany({
      where:   { contingentId: { in: contingentIds } },
      select:  { id: true, name: true, eduLevel: true, ppki: true, classGrade: true, className: true, age: true },
      orderBy: { name: "asc" },
    }),
    db.competition.findMany({
      select: {
        id: true, code: true, name: true,
        targetGroups: { select: { targetGroup: { select: { schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } } },
      },
    }),
    db.team.findMany({
      where:  { contingentId: { in: contingentIds } },
      select: { name: true, competitionId: true, members: { select: { participantId: true } } },
    }),
    db.walkInRegistration.findMany({
      where:  { contingentId: { in: contingentIds }, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { participantId: true, teamId: true, walkInCompetition: { select: { competitionId: true } } },
    }),
    issuedGeneral(contingentIds),
  ]);

  // competitionId → participantId → where they took part
  const reg = new Map<string, Map<string, string[]>>();
  const add = (comp: string, pid: string, via: string) => {
    const m = reg.get(comp) ?? new Map<string, string[]>();
    const list = m.get(pid) ?? [];
    if (!list.includes(via)) list.push(via);
    m.set(pid, list); reg.set(comp, m);
  };
  for (const t of teams) for (const m of t.members) add(t.competitionId, m.participantId, t.name);
  for (const w of walkIns) add(w.walkInCompetition.competitionId, w.participantId, "Walk-in");

  const out: RosterCompetition[] = [];
  for (const c of competitions) {
    const groups = c.targetGroups.map(t => t.targetGroup);
    const registered = reg.get(c.id) ?? new Map<string, string[]>();
    const participants = people
      .filter(p => registered.has(p.id) || (groups.length > 0 && groups.some(g => matchesTargetGroup(p, g))))
      .map(p => ({
        id: p.id, name: p.name,
        classLabel: [p.classGrade?.trim(), p.className?.trim()].filter(Boolean).join(" ") || null,
        registered: registered.has(p.id), via: registered.get(p.id) ?? [],
        certificateId: issued.get(`${c.id}:${p.id}`) ?? null,
      }));
    if (participants.length) out.push({ id: c.id, code: c.code, name: c.name, participants });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
