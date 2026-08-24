import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Participant, TargetGroup } from "@prisma/client";
import { logError } from "@/lib/appLogger";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const CHUNK_SIZE = 50;

type JobStatus = "RUNNING" | "DONE" | "ERROR";

type Job = {
  id: string;
  competitionId: string;
  competitionCode: string;
  status: JobStatus;
  total: number;      // selected for registration
  done: number;       // processed
  registered: number; // actually registered
  skipped: number;
  error?: string;
  startedAt: number;
};

// In-memory job store (lost on server restart — UI handles "job not found")
const globalForJobs = globalThis as unknown as { bulkRegisterJobs?: Map<string, Job> };
const jobs = (globalForJobs.bulkRegisterJobs ??= new Map<string, Job>());

// Mirrors targetGroupMatchSql / eligible-participants isEligible()
function isEligible(p: Participant, groups: TargetGroup[]): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) => {
    if (g.schoolLevel.toUpperCase() !== p.eduLevel) return false;
    if (g.ppki && !p.ppki) return false;
    if (g.classGrades.length > 0) {
      return !!p.classGrade && g.classGrades.includes(p.classGrade);
    }
    if (g.minAge > 0 || g.maxAge > 0) {
      if (p.age == null) return false;
      if (g.minAge > 0 && p.age < g.minAge) return false;
      if (g.maxAge > 0 && p.age > g.maxAge) return false;
      return true;
    }
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runJob(job: Job, overallPct: number, gradePcts: Record<string, number>) {
  try {
    const competition = await db.competition.findUnique({
      where: { id: job.competitionId },
      include: { targetGroups: { include: { targetGroup: true } } },
    });
    if (!competition) throw new Error("COMPETITION_NOT_FOUND");
    const targetGroups = competition.targetGroups.map(ctg => ctg.targetGroup);

    // Already-registered participants (per-competition dedup guard)
    const existingMembers = await db.teamMember.findMany({
      where: { team: { competitionId: job.competitionId } },
      select: { participantId: true },
    });
    const alreadyRegistered = new Set(existingMembers.map(m => m.participantId));

    // Eligible pool (ACTIVE, matches any target group, not yet registered)
    const participants = await db.participant.findMany({
      where: { status: "ACTIVE" },
      include: {
        contingent: {
          include: {
            school:           { include: { zone: true, state: true } },
            higherInstitution: true,
            zone:  true,
            state: true,
          },
        },
      },
    });
    const pool = shuffle(participants.filter(p => !alreadyRegistered.has(p.id) && isEligible(p, targetGroups)));

    // Apply percentage targets: per-grade override, else overall
    const selected = pool.filter(p => {
      const pct = (p.classGrade && gradePcts[p.classGrade] !== undefined)
        ? gradePcts[p.classGrade]
        : overallPct;
      return Math.random() * 100 < pct;
    });

    job.total = selected.length;

    for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
      const chunk = selected.slice(i, i + CHUNK_SIZE);
      for (const p of chunk) {
        try {
          const c = p.contingent;
          const contingentName =
            c.contingentType === "SCHOOL" ? (c.school?.name ?? c.name)
            : c.contingentType === "HIGHER" ? (c.higherInstitution?.name ?? c.name)
            : c.name;

          const team = await db.team.create({
            data: {
              name:          p.name,
              competitionId: job.competitionId,
              contingentId:  p.contingentId,
            },
          });
          await db.teamMember.create({ data: { teamId: team.id, participantId: p.id } });
          await db.registrationStat.create({
            data: {
              batchId:         job.id,
              competitionId:   job.competitionId,
              competitionCode: job.competitionCode,
              participantId:   p.id,
              gender:          p.gender,
              age:             p.age,
              classGrade:      p.classGrade,
              ethnic:          p.ethnicity,
              contingentId:    p.contingentId,
              contingent:      contingentName,
              contingentType:  c.contingentType,
              zone:            c.zone?.name ?? c.school?.zone?.name ?? null,
              state:           c.state?.name ?? c.school?.state?.name ?? null,
              ppd:             c.school?.ppdCode ?? null,
              schoolCategory:  c.school?.category ?? null,
            },
          });
          job.registered++;
        } catch (e) {
          job.skipped++;
          logError("data-watch/bulk-register row", e);
        }
        job.done++;
      }
      // Yield between chunks so poll requests interleave
      await new Promise(r => setTimeout(r, 25));
    }

    job.status = "DONE";
  } catch (e) {
    job.status = "ERROR";
    job.error = e instanceof Error ? e.message : String(e);
    logError("data-watch/bulk-register", e);
  }
}

// POST — start a bulk-registration job
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    competitionId?: string;
    overallPct?: number;
    gradePcts?: Record<string, number>;
  } | null;

  const competitionId = body?.competitionId;
  if (!competitionId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const overallPct = Math.max(0, Math.min(100, Number(body?.overallPct ?? 0)));
  const gradePcts: Record<string, number> = {};
  if (body?.gradePcts && typeof body.gradePcts === "object") {
    for (const [g, v] of Object.entries(body.gradePcts)) {
      const pct = Math.max(0, Math.min(100, Number(v)));
      if (!Number.isNaN(pct)) gradePcts[g] = pct;
    }
  }

  if (overallPct === 0 && Object.values(gradePcts).every(v => v === 0))
    return NextResponse.json({ error: "NO_TARGET", message: "Set an overall or per-grade percentage above 0." }, { status: 400 });

  // One running job per competition at a time
  for (const j of jobs.values()) {
    if (j.competitionId === competitionId && j.status === "RUNNING")
      return NextResponse.json({ error: "JOB_RUNNING", jobId: j.id }, { status: 409 });
  }

  const competition = await db.competition.findUnique({ where: { id: competitionId }, select: { code: true } });
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });

  const job: Job = {
    id: `batch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    competitionId,
    competitionCode: competition.code,
    status: "RUNNING",
    total: 0, done: 0, registered: 0, skipped: 0,
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);

  // Fire and forget — progress is polled via GET
  void runJob(job, overallPct, gradePcts);

  return NextResponse.json({ jobId: job.id });
}

// GET ?jobId= — poll job progress
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    jobId:      job.id,
    competitionId: job.competitionId,
    status:     job.status,
    total:      job.total,
    done:       job.done,
    registered: job.registered,
    skipped:    job.skipped,
    error:      job.error ?? null,
    elapsedMs:  Date.now() - job.startedAt,
  });
}
