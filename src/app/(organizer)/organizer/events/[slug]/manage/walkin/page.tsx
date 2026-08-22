import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { WalkInManageClient, type SlotScheduleConfig } from "@/components/organizer/events/WalkInManageClient";

export const metadata: Metadata = { title: "Walk-in Registration" };

export default async function WalkInManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      walkInCompetitions: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, competitionId: true, picName: true, maxSlots: true,
          publishToPortal: true, useViblockarena: true, useDronearena: true, useVibeblocks: true,
          viblockChallengeId: true, viblockChallengeLocked: true, judgingTemplatesLocked: true,
          vibeBlocksChallengeId: true, vibeBlocksEventName: true, vibeBlocksStartsAt: true, vibeBlocksEndsAt: true, vibeBlocksRunDurationSec: true,
          walkInSlotSchedule: true,
          competition: { select: { id: true, code: true, name: true } },
          _count: { select: { registrations: true } },
          endpoints: {
            where: { active: true },
            orderBy: { createdAt: "asc" },
            select: { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true },
          },
        },
      },
      walkInEndpoints: {
        where: { walkInCompetitionId: null, active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  // Serialize Date fields to strings for the client component
  const serializedEvent = {
    ...event,
    walkInCompetitions: event.walkInCompetitions.map(wic => ({
      ...wic,
      vibeBlocksStartsAt: wic.vibeBlocksStartsAt?.toISOString() ?? null,
      vibeBlocksEndsAt:   wic.vibeBlocksEndsAt?.toISOString()   ?? null,
      walkInSlotSchedule: (wic.walkInSlotSchedule ?? null) as SlotScheduleConfig | null,
    })),
  };

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WalkInManageClient event={serializedEvent} canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)} />
    </OrganizerShell>
  );
}
