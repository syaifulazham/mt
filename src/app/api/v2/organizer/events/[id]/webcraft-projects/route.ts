import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftPublishedProjects } from "@/lib/eptim-webcraft";
import { WEBCRAFT_INTEGRATION, type ParticipantProjects } from "@/lib/webcraftJudging";

/**
 * GET /api/v2/organizer/events/[id]/webcraft-projects
 *
 * Published WebCraft projects for every participant entered in this event's
 * WebCraft competitions, keyed by participant id. Called by the judging page
 * after it renders, so a slow WebCraft never delays the roster. Participants
 * without a local WebCraft account are simply absent — the page already knows.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "WEBCRAFT_NOT_CONFIGURED" }, { status: 503 });

  const { id: eventId } = await params;

  const accounts = await db.participantWebcraftAccess.findMany({
    where: {
      participant: {
        teamMembers: {
          some: {
            team: {
              teamEvents:  { some: { eventId } },
              competition: {
                thirdPartyIntegration: WEBCRAFT_INTEGRATION,
                eventCompetitions:     { some: { eventId } },
              },
            },
          },
        },
      },
    },
    select: { participantId: true, webcraftUserId: true },
  });

  try {
    const remote = await webcraftPublishedProjects(accounts.map((a) => a.webcraftUserId));
    const data: Record<string, ParticipantProjects> = {};
    for (const a of accounts) {
      const u = remote.get(a.webcraftUserId);
      data[a.participantId] = !u ? { state: "unknown" }
        : !u.exists ? { state: "no_account" }
        : { state: "ok", projects: u.projects };
    }
    return NextResponse.json({ data, fetchedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[webcraft] published projects failed for event ${eventId}:`, err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: err.message ?? "WebCraft API error" }, { status: 502 });
  }
}
