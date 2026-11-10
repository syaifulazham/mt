import { db } from "@/lib/db";
import { toWebcraftUserId, webcraftCreateUser, webcraftPublishedProjects } from "@/lib/eptim-webcraft";
import { WEBCRAFT_INTEGRATION } from "@/lib/webcraftJudging";

export function randomWebcraftPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export type TeamWebcraftContext = {
  team: { id: string; name: string; contingent: string | null };
  access: { webcraftUserId: string; webcraftPassword: string; sourceParticipantId: string | null } | null;
  /** Members' personal accounts, oldest first — candidates for adoption. */
  memberAccounts: { participantId: string; name: string; webcraftUserId: string; webcraftPassword: string; createdAt: Date }[];
};

/**
 * The team's WebCraft state, after checking the caller is a member of a
 * WebCraft team. Returns an error code instead when not allowed.
 */
export async function loadTeamWebcraft(teamId: string, participantId: string):
  Promise<TeamWebcraftContext | { error: "NOT_MEMBER" | "NOT_INTEGRATED" }> {
  const membership = await db.teamMember.findUnique({
    where:  { teamId_participantId: { teamId, participantId } },
    select: {
      team: {
        select: {
          id: true, name: true,
          contingent:     { select: { name: true } },
          competition:    { select: { thirdPartyIntegration: true } },
          webcraftAccess: { select: { webcraftUserId: true, webcraftPassword: true, sourceParticipantId: true } },
          members: {
            select: {
              participant: {
                select: {
                  id: true, name: true,
                  webcraftAccess: { select: { webcraftUserId: true, webcraftPassword: true, createdAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!membership) return { error: "NOT_MEMBER" };
  const t = membership.team;
  if (t.competition.thirdPartyIntegration !== WEBCRAFT_INTEGRATION) return { error: "NOT_INTEGRATED" };

  return {
    team:   { id: t.id, name: t.name, contingent: t.contingent?.name ?? null },
    access: t.webcraftAccess,
    memberAccounts: t.members
      .filter((m) => m.participant.webcraftAccess)
      .map((m) => ({ participantId: m.participant.id, name: m.participant.name, ...m.participant.webcraftAccess! }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

/**
 * The team's shared account, creating it on first use.
 *
 * When members already have personal accounts, the team adopts the one with
 * the most published projects (oldest on a tie, or when WebCraft can't be
 * asked) so work already done stays reachable. Otherwise a fresh account is
 * made for the team. teamId is unique, so concurrent first sign-ins converge
 * on whichever row was written first.
 */
export async function ensureTeamWebcraftAccess(ctx: TeamWebcraftContext) {
  if (ctx.access) return ctx.access;

  if (ctx.memberAccounts.length > 0) {
    let pick = ctx.memberAccounts[0];
    if (ctx.memberAccounts.length > 1) {
      const remote = await webcraftPublishedProjects(ctx.memberAccounts.map((a) => a.webcraftUserId)).catch(() => null);
      if (remote) {
        let best = -1;
        for (const a of ctx.memberAccounts) {
          const n = remote.get(a.webcraftUserId)?.projects.length ?? 0;
          if (n > best) { best = n; pick = a; }
        }
      }
    }
    return claim(ctx.team.id, {
      webcraftUserId: pick.webcraftUserId, webcraftPassword: pick.webcraftPassword, sourceParticipantId: pick.participantId,
    });
  }

  // No member account to adopt: claim the row first, then create the account.
  const fresh = {
    webcraftUserId: toWebcraftUserId(`t-${ctx.team.id}`), webcraftPassword: randomWebcraftPassword(), sourceParticipantId: null,
  };
  const row = await claim(ctx.team.id, fresh);
  if (row.webcraftUserId !== fresh.webcraftUserId || row.webcraftPassword !== fresh.webcraftPassword) return row;

  try {
    await webcraftCreateUser({
      userId: fresh.webcraftUserId, name: ctx.team.name, password: fresh.webcraftPassword,
      otherDetails: { school: ctx.team.contingent ?? undefined, team: true },
    });
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status !== 409) {
      await db.teamWebcraftAccess.delete({ where: { teamId: ctx.team.id } }).catch(() => {});
      throw e;
    }
  }
  return row;
}

async function claim(teamId: string, data: { webcraftUserId: string; webcraftPassword: string; sourceParticipantId: string | null }) {
  // Insert-if-absent, then read back whichever row won.
  await db.teamWebcraftAccess.createMany({ data: [{ teamId, ...data }], skipDuplicates: true });
  const row = await db.teamWebcraftAccess.findUnique({
    where: { teamId }, select: { webcraftUserId: true, webcraftPassword: true, sourceParticipantId: true },
  });
  if (!row) throw new Error("Gagal menyimpan akaun Webcraft pasukan");
  return row;
}
